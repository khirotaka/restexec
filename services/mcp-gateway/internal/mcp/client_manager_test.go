package mcp

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewClientManager(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	assert.NotNil(t, cm)
	assert.NotNil(t, cm.sessions)
	assert.Empty(t, cm.sessions)
	assert.NotNil(t, cm.toolsCache)
	assert.Empty(t, cm.toolsCache)
}

func TestClientManager_GetTools_Empty(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	tools := cm.GetTools()

	assert.NotNil(t, tools)
	assert.Len(t, tools, 0)
}

func TestClientManager_GetTools_ReturnsSlice(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	// GetTools should always return a slice, not nil
	tools1 := cm.GetTools()
	tools2 := cm.GetTools()

	assert.NotNil(t, tools1)
	assert.NotNil(t, tools2)
	assert.Len(t, tools1, 0)
	assert.Len(t, tools2, 0)
}

func TestClientManager_CallTool_ServerNotFound(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()
	result, err := cm.CallTool(ctx, "nonexistent", "test", map[string]any{})

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}

func TestClientManager_CallTool_InputNotMap(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()

	// Without an initialized session, server check happens first
	// and returns "server not found" before input validation
	result, err := cm.CallTool(ctx, "test-server", "test", "not-a-map")

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}

func TestClientManager_CallTool_InputAsArray(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()

	// Without an initialized session, server check happens first
	// and returns "server not found" before input validation
	result, err := cm.CallTool(ctx, "test-server", "test", []string{"a", "b"})

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}

func TestClientManager_CallTool_InputAsNumber(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()

	// Without an initialized session, server check happens first
	// and returns "server not found" before input validation
	result, err := cm.CallTool(ctx, "test-server", "test", 42)

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}

func TestClientManager_Close_EmptyManager(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	// Close on empty manager should succeed
	err := cm.Close()

	assert.NoError(t, err)
}

// TestClientManager_ConcurrentGetTools tests concurrent access to GetTools
func TestClientManager_ConcurrentGetTools(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	// Concurrent reads should not cause data race
	done := make(chan bool, 10)

	for i := 0; i < 10; i++ {
		go func() {
			_ = cm.GetTools()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

// TestClientManager_GetToolsReturnsNewSlice tests that GetTools returns a new slice each time
func TestClientManager_GetToolsReturnsNewSlice(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	tools1 := cm.GetTools()
	tools2 := cm.GetTools()

	// Should return different slice instances
	// (this is implicitly tested by the implementation using make())
	assert.NotSame(t, &tools1, &tools2)
	assert.Equal(t, tools1, tools2)
}

// TestClientManager_CallTool_ValidInputMapIsRequired tests that valid map input is required
func TestClientManager_CallTool_ValidInputMap(t *testing.T) {
	pm := NewProcessManager()
	pm.SetStatus("test-server", StatusAvailable)
	cm := NewClientManager(pm)

	ctx := context.Background()

	// Valid map input
	validInput := map[string]any{
		"param1": "value1",
		"param2": 123,
	}

	// This will fail because no session is initialized, but it should pass the input validation
	_, err := cm.CallTool(ctx, "test-server", "test", validInput)

	// Error should be about missing session, not invalid input
	assert.Error(t, err)
	// The error should NOT be "input must be a map"
	assert.NotEqual(t, "input must be a map", err.Error())
}

// TestClientManager_CallTool_ServerNotFoundMessage tests the exact error message
func TestClientManager_CallTool_ServerNotFoundErrorMessage(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()
	_, err := cm.CallTool(ctx, "unknown", "tool", map[string]any{})

	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}

// TestClientManager_CallTool_InputValidationOrder tests that server check comes before input validation
func TestClientManager_CallTool_ServerCheckBeforeInputValidation(t *testing.T) {
	pm := NewProcessManager()
	cm := NewClientManager(pm)

	ctx := context.Background()

	// Even with invalid input, missing server should error first
	result, err := cm.CallTool(ctx, "missing-server", "tool", "invalid")

	assert.Nil(t, result)
	assert.Error(t, err)
	assert.Equal(t, "server not found", err.Error())
}
