package http

import (
	"context"
	"maps"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
)

// mockClientManager implements ClientManagerInterface for testing.
type mockClientManager struct {
	callToolFunc func(ctx context.Context, server, toolName string, input any) (any, error)
	getToolsFunc func() []mcp.ToolInfo
	closeFunc    func() error
}

// NewMockClientManager creates a new mock ClientManager.
func NewMockClientManager() *mockClientManager {
	return &mockClientManager{}
}

// CallTool implements ClientManagerInterface.
func (m *mockClientManager) CallTool(ctx context.Context, server, toolName string, input any) (any, error) {
	if m.callToolFunc != nil {
		return m.callToolFunc(ctx, server, toolName, input)
	}
	return nil, nil
}

// GetTools implements ClientManagerInterface.
func (m *mockClientManager) GetTools() []mcp.ToolInfo {
	if m.getToolsFunc != nil {
		return m.getToolsFunc()
	}
	return []mcp.ToolInfo{}
}

// Close implements ClientManagerInterface.
func (m *mockClientManager) Close() error {
	if m.closeFunc != nil {
		return m.closeFunc()
	}
	return nil
}

// OnCallTool sets the behavior for CallTool.
func (m *mockClientManager) OnCallTool(fn func(ctx context.Context, server, toolName string, input any) (any, error)) *mockClientManager {
	m.callToolFunc = fn
	return m
}

// OnGetTools sets the behavior for GetTools.
func (m *mockClientManager) OnGetTools(fn func() []mcp.ToolInfo) *mockClientManager {
	m.getToolsFunc = fn
	return m
}

// OnClose sets the behavior for Close.
func (m *mockClientManager) OnClose(fn func() error) *mockClientManager {
	m.closeFunc = fn
	return m
}

// mockProcessManager implements ProcessManagerInterface for testing.
type mockProcessManager struct {
	statuses map[string]mcp.ServerStatus
}

// NewMockProcessManager creates a new mock ProcessManager.
func NewMockProcessManager() *mockProcessManager {
	return &mockProcessManager{
		statuses: make(map[string]mcp.ServerStatus),
	}
}

// GetStatus implements ProcessManagerInterface.
func (m *mockProcessManager) GetStatus(serverName string) mcp.ServerStatus {
	if status, ok := m.statuses[serverName]; ok {
		return status
	}
	return mcp.StatusUnavailable
}

// SetStatus implements ProcessManagerInterface.
func (m *mockProcessManager) SetStatus(serverName string, status mcp.ServerStatus) {
	m.statuses[serverName] = status
}

// GetAllStatuses implements ProcessManagerInterface.
func (m *mockProcessManager) GetAllStatuses() map[string]mcp.ServerStatus {
	result := make(map[string]mcp.ServerStatus)
	maps.Copy(result, m.statuses)
	return result
}

// WithStatus sets a server status in the mock.
func (m *mockProcessManager) WithStatus(serverName string, status mcp.ServerStatus) *mockProcessManager {
	m.SetStatus(serverName, status)
	return m
}
