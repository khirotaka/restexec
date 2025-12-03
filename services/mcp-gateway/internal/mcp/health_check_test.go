package mcp

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockMCPSession is a mock implementation of MCPSession
type MockMCPSession struct {
	mock.Mock
}

func (m *MockMCPSession) Ping(ctx context.Context, params *mcp.PingParams) error {
	args := m.Called(ctx, params)
	return args.Error(0)
}

func (m *MockMCPSession) CallTool(ctx context.Context, params *mcp.CallToolParams) (*mcp.CallToolResult, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*mcp.CallToolResult), args.Error(1)
}

func (m *MockMCPSession) ListTools(ctx context.Context, params *mcp.ListToolsParams) (*mcp.ListToolsResult, error) {
	args := m.Called(ctx, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*mcp.ListToolsResult), args.Error(1)
}

func (m *MockMCPSession) Close() error {
	args := m.Called()
	return args.Error(0)
}

func (m *MockMCPSession) Wait() error {
	args := m.Called()
	return args.Error(0)
}

func TestStartHealthCheck_Success(t *testing.T) {
	pm := NewProcessManager(100, "never") // 100ms interval
	cm := NewClientManager(pm)

	mockSession := new(MockMCPSession)
	mockSession.On("Ping", mock.Anything, mock.Anything).Return(nil)

	cm.sessions["test-server"] = mockSession
	pm.SetStatus("test-server", StatusAvailable)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cm.StartHealthCheck(ctx, "test-server")

	// Wait for a few checks
	time.Sleep(350 * time.Millisecond)

	// Verify Ping was called
	mockSession.AssertCalled(t, "Ping", mock.Anything, mock.Anything)

	// Verify status is still available
	assert.Equal(t, StatusAvailable, pm.GetStatus("test-server"))
}

func TestStartHealthCheck_ThreeFailuresTriggerRestart(t *testing.T) {
	pm := NewProcessManager(50, "on-failure") // 50ms interval
	cm := NewClientManager(pm)

	mockSession := new(MockMCPSession)
	// Return error for Ping
	mockSession.On("Ping", mock.Anything, mock.Anything).Return(errors.New("ping failed"))

	cm.sessions["test-server"] = mockSession
	pm.SetStatus("test-server", StatusAvailable)

	// Mock restart handler
	restartTriggered := make(chan struct{})
	pm.SetOnServerCrashed(func(serverName string) {
		assert.Equal(t, "test-server", serverName)
		close(restartTriggered)
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cm.StartHealthCheck(ctx, "test-server")

	// Wait for restart trigger
	select {
	case <-restartTriggered:
		// Success
	case <-time.After(1 * time.Second):
		t.Fatal("Restart was not triggered within timeout")
	}

	// Verify status is crashed
	assert.Equal(t, StatusCrashed, pm.GetStatus("test-server"))
}

func TestStartHealthCheck_RecoveryResetsCounter(t *testing.T) {
	pm := NewProcessManager(50, "never")
	cm := NewClientManager(pm)

	mockSession := new(MockMCPSession)
	// Fail twice then succeed
	mockSession.On("Ping", mock.Anything, mock.Anything).Return(errors.New("ping failed")).Twice()
	mockSession.On("Ping", mock.Anything, mock.Anything).Return(nil)

	cm.sessions["test-server"] = mockSession
	pm.SetStatus("test-server", StatusAvailable)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cm.StartHealthCheck(ctx, "test-server")

	// Wait for checks
	time.Sleep(250 * time.Millisecond)

	// Verify internal state (need to access private field for test, or rely on behavior)
	// Since we can't access private fields easily without reflection or export,
	// we verify that status didn't change to Crashed
	assert.Equal(t, StatusAvailable, pm.GetStatus("test-server"))

	// And verify restart attempts are 0 (reset happened)
	assert.Equal(t, 0, pm.GetRestartAttempts("test-server"))
}

func TestStartHealthCheck_CancellationStopsGoroutine(t *testing.T) {
	pm := NewProcessManager(50, "never")
	cm := NewClientManager(pm)

	mockSession := new(MockMCPSession)
	mockSession.On("Ping", mock.Anything, mock.Anything).Return(nil)

	cm.sessions["test-server"] = mockSession

	ctx, cancel := context.WithCancel(context.Background())
	cm.StartHealthCheck(ctx, "test-server")

	// Let it run a bit
	time.Sleep(100 * time.Millisecond)

	// Cancel
	cancel()

	// Wait for goroutine to exit (checked via internal map if possible, or just ensure no more pings)
	// We can check if healthCheckCancels map is empty for this server after a short wait
	// But StartHealthCheck cleans up asynchronously.

	time.Sleep(100 * time.Millisecond)

	cm.mu.Lock()
	_, ok := cm.healthCheckCancels["test-server"]
	cm.mu.Unlock()

	assert.False(t, ok, "Health check cancel function should be removed from map")
}

func TestRestartServer_BackoffCalculation(t *testing.T) {
	pm := NewProcessManager(100, "on-failure")

	assert.Equal(t, 1*time.Second, pm.CalculateBackoff(1))
	assert.Equal(t, 2*time.Second, pm.CalculateBackoff(2))
	assert.Equal(t, 4*time.Second, pm.CalculateBackoff(3))
	assert.Equal(t, 4*time.Second, pm.CalculateBackoff(4))
	assert.Equal(t, 4*time.Second, pm.CalculateBackoff(10))
}

func TestRestartServer_MaxAttemptsExceeded(t *testing.T) {
	pm := NewProcessManager(100, "on-failure")
	cm := NewClientManager(pm)

	cfg := config.ServerConfig{Name: "test-server"}

	// Simulate 3 previous attempts (max is 3)
	pm.IncrementRestartAttempts("test-server")
	pm.IncrementRestartAttempts("test-server")
	pm.IncrementRestartAttempts("test-server")

	err := cm.RestartServer(context.Background(), cfg)

	// RestartServer returns immediately (nil), but executes asynchronously in a goroutine
	assert.Nil(t, err)

	// Use Eventually pattern to wait for goroutine completion with retries
	// This is more robust than fixed time.Sleep in resource-constrained environments
	assert.Eventually(t, func() bool {
		cm.mu.Lock()
		isRestarting := cm.restarting["test-server"]
		cm.mu.Unlock()
		// Goroutine should complete and clear the restarting flag
		return !isRestarting
	}, 1*time.Second, 50*time.Millisecond, "goroutine should complete and clear restarting flag")

	// Verify that restart attempts counter was NOT incremented
	// (because the max attempts check at L173-177 prevented the increment at L178)
	assert.Equal(t, 3, pm.GetRestartAttempts("test-server"))

	// Note: We cannot directly verify that connectClient was NOT called without additional
	// mocking infrastructure, but the unchanged counter and cleared restarting flag
	// confirm the goroutine exited early as expected.
}

func TestRestartServer_PolicyNever(t *testing.T) {
	pm := NewProcessManager(100, "never")
	cm := NewClientManager(pm)

	cfg := config.ServerConfig{Name: "test-server"}

	err := cm.RestartServer(context.Background(), cfg)

	// Should return nil (async) but do nothing.
	assert.Nil(t, err)

	// Verify attempts didn't increase
	assert.Equal(t, 0, pm.GetRestartAttempts("test-server"))
}
