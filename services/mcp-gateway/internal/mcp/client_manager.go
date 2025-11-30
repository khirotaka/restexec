package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	mcpErrors "github.com/khirotaka/restexec/services/mcp-gateway/pkg/errors"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ClientManager manages multiple MCP clients
type ClientManager struct {
	sessions       map[string]*mcp.ClientSession
	processes      map[string]*exec.Cmd
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
		processes:      make(map[string]*exec.Cmd),
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
	var safeEnvVars = []string{"PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TMPDIR"}
	// ホワイトリストの環境変数のみ継承
	env := make([]string, 0)
	for _, key := range safeEnvVars {
		if val := os.Getenv(key); val != "" {
			env = append(env, fmt.Sprintf("%s=%s", key, val))
		}
	}

	for _, e := range cfg.Envs {
		env = append(env, fmt.Sprintf("%s=%s", e.Name, e.Value))
	}

	// Create command
	cmd := exec.Command(cfg.Command, cfg.Args...)
	cmd.Env = env

	// Store process reference for shutdown
	// Note: cmd.Process will be non-nil only after Connect() starts the process
	m.processes[cfg.Name] = cmd

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
		// Clean up process if Connect failed
		// The process may have been started by CommandTransport
		if cmd.Process != nil {
			if err := cmd.Process.Kill(); err != nil {
				slog.Warn("Failed to kill process during cleanup", "server", cfg.Name, "error", err)
			}
		}
		// Remove from process map to prevent resource leak
		delete(m.processes, cfg.Name)
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Store session
	m.sessions[cfg.Name] = session
	m.processManager.SetStatus(cfg.Name, StatusAvailable)

	// Cache tools
	if err := m.cacheTools(ctx, cfg.Name, session, cfg.Timeout); err != nil {
		// Clean up session and process if tool caching failed
		if err := session.Close(); err != nil {
			slog.Warn("Failed to close session during cleanup", "server", cfg.Name, "error", err)
		}
		if cmd.Process != nil {
			if err := cmd.Process.Kill(); err != nil {
				slog.Warn("Failed to kill process during cleanup", "server", cfg.Name, "error", err)
			}
		}
		delete(m.sessions, cfg.Name)
		delete(m.processes, cfg.Name)
		m.processManager.SetStatus(cfg.Name, StatusUnavailable)
		return fmt.Errorf("failed to cache tools: %w", err)
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
		return nil, fmt.Errorf("input must be a map, got %T", input)
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

	var (
		wg   sync.WaitGroup
		errs []error
	)

	// 1. Close sessions
	for name, session := range m.sessions {
		if err := session.Close(); err != nil {
			errs = append(errs, fmt.Errorf("failed to close session %s: %w", name, err))
		}
	}

	// 2. Terminate processes gracefully
	errCh := make(chan error, len(m.processes))
	for name, cmd := range m.processes {
		if cmd.Process != nil {
			wg.Add(1)
			go func(n string, c *exec.Cmd) {
				defer wg.Done()
				// First, send SIGTERM
				if err := c.Process.Signal(syscall.SIGTERM); err != nil {
					slog.Warn("Failed to send SIGTERM", "server", n, "error", err)
				}

				// Wait for process to exit with timeout
				done := make(chan error, 1)
				go func() {
					done <- c.Wait()
				}()

				select {
				case <-time.After(5 * time.Second):
					// If process doesn't exit after 5 seconds, kill it
					if err := c.Process.Kill(); err != nil {
						errCh <- fmt.Errorf("failed to kill process %s: %w", n, err)
						slog.Warn("Failed to kill process", "server", n, "error", err)
					} else {
						slog.Warn("Process killed after timeout", "server", n)
						// Wait for the killed process to actually terminate
						<-done
					}
				case err := <-done:
					if err != nil {
						slog.Debug("Process exited with error", "server", n, "error", err)
					} else {
						slog.Info("Process exited gracefully", "server", n)
					}
				}
			}(name, cmd)
		}
	}

	wg.Wait()
	close(errCh)

	// Collect errors from channel
	for err := range errCh {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors closing sessions or processes: %v", errs)
	}
	return nil
}
