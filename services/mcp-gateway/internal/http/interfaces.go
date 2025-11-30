package http

import (
	"context"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
)

// ClientManagerInterface defines the interface for MCP client management.
// This interface is used for dependency injection in tests.
type ClientManagerInterface interface {
	CallTool(ctx context.Context, server, toolName string, input any) (any, error)
	GetTools() []mcp.ToolInfo
	Close() error
}

// ProcessManagerInterface defines the interface for process status management.
// This interface is used for dependency injection in tests.
type ProcessManagerInterface interface {
	GetStatus(serverName string) mcp.ServerStatus
	SetStatus(serverName string, status mcp.ServerStatus)
	GetAllStatuses() map[string]mcp.ServerStatus
}
