package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// StartHealthCheck starts MCP ping-based health monitoring for a server
// TODO: Make consecutive failure threshold configurable (currently hardcoded to 3)
func (m *ClientManager) StartHealthCheck(ctx context.Context, serverName string) {
	interval := time.Duration(m.processManager.healthCheckInterval) * time.Millisecond

	// Cancel existing health check for this server
	m.mu.Lock()
	if cancel, ok := m.healthCheckCancels[serverName]; ok {
		slog.Debug("Cancelling existing health check", "server", serverName)
		cancel()
	}

	// Initialize health check state
	if m.healthCheckStates[serverName] == nil {
		m.healthCheckStates[serverName] = &HealthCheckState{}
	}
	state := m.healthCheckStates[serverName]

	healthCtx, cancel := context.WithCancel(ctx)
	m.healthCheckCancels[serverName] = cancel
	m.mu.Unlock()

	go func() {
		defer func() {
			m.mu.Lock()
			delete(m.healthCheckCancels, serverName)
			m.mu.Unlock()
			slog.Debug("Health check goroutine exited", "server", serverName)
		}()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-healthCtx.Done():
				slog.Debug("Health check stopped", "server", serverName)
				return
			case <-ticker.C:
				m.mu.RLock()
				session, ok := m.sessions[serverName]
				m.mu.RUnlock()

				if !ok {
					slog.Debug("Health check stopped - session not found", "server", serverName)
					return
				}

				// Calculate ping timeout: interval/2, min 3s, max 10s
				pingTimeout := interval / 2
				if pingTimeout < 3*time.Second {
					pingTimeout = 3 * time.Second
				}
				if pingTimeout > 10*time.Second {
					pingTimeout = 10 * time.Second
				}

				// MCP ping with timeout
				pingCtx, pingCancel := context.WithTimeout(context.Background(), pingTimeout)
				err := session.Ping(pingCtx, &mcp.PingParams{})
				pingCancel()

				state.lastCheckTime = time.Now()

				if err != nil {
					state.consecutiveFailures++
					slog.Warn("Health check failed - MCP ping failed",
						"server", serverName,
						"consecutive_failures", state.consecutiveFailures,
						"error", err)

					// 3-strike rule: Only mark as crashed after 3 consecutive failures
					if state.consecutiveFailures >= 3 {
						m.processManager.SetStatus(serverName, StatusCrashed)

						// Trigger restart if policy allows
						if m.processManager.onServerCrashed != nil {
							m.processManager.onServerCrashed(serverName)
						}
					}
					// Continue checking instead of returning - allows recovery detection
					continue
				} else {
					// Reset failure counter on success
					if state.consecutiveFailures > 0 {
						slog.Info("Health check recovered",
							"server", serverName,
							"previous_failures", state.consecutiveFailures)
						state.consecutiveFailures = 0
						m.processManager.ResetRestartAttempts(serverName)
					}
				}
			}
		}
	}()
}

// RestartServer attempts to restart a crashed server
func (m *ClientManager) RestartServer(ctx context.Context, cfg config.ServerConfig) error {
	// Set restarting flag to block API requests
	m.mu.Lock()
	m.restarting[cfg.Name] = true
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.restarting, cfg.Name)
		m.mu.Unlock()
	}()

	// Check restart policy
	if m.processManager.restartPolicy != "on-failure" {
		slog.Info("Restart skipped due to policy", "server", cfg.Name, "policy", m.processManager.restartPolicy)
		return nil
	}

	// Check max attempts
	attempts := m.processManager.IncrementRestartAttempts(cfg.Name)
	if attempts > 3 {
		slog.Error("Max restart attempts reached", "server", cfg.Name, "attempts", attempts)
		return fmt.Errorf("max restart attempts (3) exceeded for server %s", cfg.Name)
	}

	// Calculate backoff
	backoff := m.processManager.CalculateBackoff(attempts)
	slog.Info("Restarting server", "server", cfg.Name, "attempt", attempts, "backoff", backoff)

	// Wait for backoff
	time.Sleep(backoff)

	// Clean up old session and process
	m.mu.Lock()
	if oldSession, ok := m.sessions[cfg.Name]; ok {
		if err := oldSession.Close(); err != nil {
			slog.Warn("Failed to close old session during restart", "server", cfg.Name, "error", err)
		}
		delete(m.sessions, cfg.Name)
	}
	if oldCmd, ok := m.processes[cfg.Name]; ok {
		if oldCmd.Process != nil {
			if err := oldCmd.Process.Kill(); err != nil {
				slog.Warn("Failed to kill old process during restart", "server", cfg.Name, "error", err)
			}
		}
		delete(m.processes, cfg.Name)
	}
	m.mu.Unlock()

	// Attempt reconnection
	if err := m.connectClient(ctx, cfg); err != nil {
		return err
	}

	// Restart health check after successful reconnection
	m.StartHealthCheck(ctx, cfg.Name)
	slog.Info("Server restarted successfully", "server", cfg.Name, "attempt", attempts)

	return nil
}
