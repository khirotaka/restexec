package mcp

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	mcpErrors "github.com/khirotaka/restexec/services/mcp-gateway/pkg/errors"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ClientManager manages multiple MCP clients
type ClientManager struct {
	sessions       map[string]*mcp.ClientSession
	processManager *ProcessManager
	toolsCache     map[string]ToolInfo
	mu             sync.RWMutex
}

// ToolInfo represents cached tool information
type ToolInfo struct {
	Timeout      int    `json:"timeout"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Server       string `json:"server"`
	InputSchema  any    `json:"inputSchema"`
	OutputSchema any    `json:"outputSchema"`
}

// NewClientManager creates a new ClientManager
func NewClientManager(pm *ProcessManager) *ClientManager {
	return &ClientManager{
		sessions:       make(map[string]*mcp.ClientSession),
		processManager: pm,
		toolsCache:     make(map[string]ToolInfo),
	}
}

// Initialize connects to all configured MCP servers
func (m *ClientManager) Initialize(ctx context.Context, configs []config.ServerConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, cfg := range configs {
		if err := m.connectClient(ctx, cfg); err != nil {
			return fmt.Errorf("failed to connect to server %s: %w", cfg.Name, err)
		}
	}
	return nil
}

func (m *ClientManager) connectClient(ctx context.Context, cfg config.ServerConfig) error {
	// Prepare environment variables
	var saveEnvVars = []string{"PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ"}
	// ホワイトリストの環境変数のみ継承
	env := make([]string, 0)
	for _, key := range saveEnvVars {
		if val := os.Getenv(key); val != "" {
			env = append(env, fmt.Sprintf("%s=%s", key, val))
		}
	}

	for _, e := range cfg.Envs {
		env = append(env, fmt.Sprintf("%s=%s", e.Name, e.Value))
	}

	// Create command
	cmd := exec.CommandContext(ctx, cfg.Command, cfg.Args...)
	cmd.Env = env

	// Create transport
	transport := &mcp.CommandTransport{
		Command: cmd,
	}

	// Create client
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "mcp-gateway",
		Version: "1.0.0",
	}, nil)

	// Connect
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Store session
	m.sessions[cfg.Name] = session
	m.processManager.SetStatus(cfg.Name, StatusAvailable)

	// Cache tools
	if err := m.cacheTools(ctx, cfg.Name, session, cfg.Timeout); err != nil {
		slog.Error("Failed to cache tools", "server", cfg.Name, "error", err)
		// Continue even if caching fails
	}

	// Monitor connection
	go func() {
		// Wait blocks until the session is closed
		err := session.Wait()
		if err != nil {
			slog.Error("MCP Client disconnected", "server", cfg.Name, "error", err)
			m.processManager.SetStatus(cfg.Name, StatusCrashed)
		} else {
			slog.Info("MCP Client disconnected", "server", cfg.Name)
			m.processManager.SetStatus(cfg.Name, StatusUnavailable)
		}
	}()

	return nil
}

func (m *ClientManager) cacheTools(ctx context.Context, serverName string, session *mcp.ClientSession, timeout int) error {
	result, err := session.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return err
	}

	for _, tool := range result.Tools {
		m.toolsCache[tool.Name] = ToolInfo{
			Timeout:      timeout,
			Name:         tool.Name,
			Description:  tool.Description,
			Server:       serverName,
			InputSchema:  tool.InputSchema,
			OutputSchema: tool.OutputSchema,
		}
	}
	return nil
}

// CallTool calls a tool on the specified server
func (m *ClientManager) CallTool(ctx context.Context, server, toolName string, input any) (any, error) {
	m.mu.RLock()
	session, ok := m.sessions[server]
	m.mu.RUnlock()

	if !ok {
		return nil, mcpErrors.ErrServerNotFound
	}

	// Check status
	if status := m.processManager.GetStatus(server); status != StatusAvailable {
		return nil, mcpErrors.ErrServerNotRunning
	}

	// Convert input to map[string]any
	inputMap, ok := input.(map[string]any)
	if !ok {
		return nil, errors.New("input must be a map")
	}

	// Call tool
	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: inputMap,
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

// GetTools returns the list of all available tools
func (m *ClientManager) GetTools() []ToolInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tools := make([]ToolInfo, 0, len(m.toolsCache))
	for _, tool := range m.toolsCache {
		tools = append(tools, tool)
	}
	return tools
}

// Close closes all sessions
func (m *ClientManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var errs []error
	for name, session := range m.sessions {
		if err := session.Close(); err != nil {
			errs = append(errs, fmt.Errorf("failed to close session %s: %w", name, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors closing sessions: %v", errs)
	}
	return nil
}
