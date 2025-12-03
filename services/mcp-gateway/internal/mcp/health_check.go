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

	// Cancel existing health check for this server and wait for it to exit
	m.mu.Lock()
	if cancel, ok := m.healthCheckCancels[serverName]; ok {
		slog.Debug("Cancelling existing health check", "server", serverName)
		cancel()
		if done, ok := m.healthCheckDone[serverName]; ok {
			// Unlock to wait for goroutine to exit to avoid deadlock
			m.mu.Unlock()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				slog.Warn("Timed out waiting for old health check to exit", "server", serverName)
			}
			m.mu.Lock()
		}
	}

	// Initialize health check state if needed (preserve existing state)
	if m.healthCheckStates[serverName] == nil {
		m.healthCheckStates[serverName] = &HealthCheckState{}
	}
	state := m.healthCheckStates[serverName]

	healthCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	m.healthCheckCancels[serverName] = cancel
	m.healthCheckDone[serverName] = done
	m.mu.Unlock()

	go func() {
		defer func() {
			m.mu.Lock()
			delete(m.healthCheckCancels, serverName)
			delete(m.healthCheckDone, serverName)
			m.mu.Unlock()
			close(done)
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
				// Rationale: Timeout should be shorter than interval to allow multiple retries,
				// but long enough to handle network latency. 3s min protects against too-short intervals,
				// 10s max prevents excessively long waits.
				pingTimeout := interval / 2
				if pingTimeout < 3*time.Second {
					pingTimeout = 3 * time.Second
				}
				if pingTimeout > 10*time.Second {
					pingTimeout = 10 * time.Second
				}

				// MCP ping with timeout
				pingCtx, pingCancel := context.WithTimeout(healthCtx, pingTimeout)
				err := session.Ping(pingCtx, &mcp.PingParams{})
				pingCancel()

				// Check if restarting
				isRestarting := m.processManager.GetStatus(serverName) == StatusRestarting

				state.mu.Lock()
				state.lastCheckTime = time.Now()

				if err != nil {
					// Only increment if below threshold and not currently restarting
					if !isRestarting && state.consecutiveFailures < 3 {
						state.consecutiveFailures++
					}
					failures := state.consecutiveFailures
					state.mu.Unlock()

					slog.Warn("Health check failed - MCP ping failed",
						"server", serverName,
						"consecutive_failures", failures,
						"error", err)

					// 3-strike rule: Only mark as crashed after 3 consecutive failures
					if failures >= 3 {
						// Check if already restarting to prevent duplicate triggers
						isRestarting := m.processManager.GetStatus(serverName) == StatusRestarting

						if !isRestarting {
							m.processManager.SetStatus(serverName, StatusCrashed)

							// Trigger restart if policy allows
							if m.processManager.onServerCrashed != nil {
								m.processManager.onServerCrashed(serverName)
							}
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
					state.mu.Unlock()
				}
			}
		}
	}()
}

// RestartServer attempts to restart a crashed server
func (m *ClientManager) RestartServer(ctx context.Context, cfg config.ServerConfig) error {
	// Check restart policy
	if m.processManager.restartPolicy != "on-failure" {
		slog.Info("Restart skipped due to policy", "server", cfg.Name, "policy", m.processManager.restartPolicy)
		m.processManager.SetStatus(cfg.Name, StatusCrashed)
		return fmt.Errorf("restart policy does not allow restart")
	}

	// Check max attempts
	currentAttempts := m.processManager.GetRestartAttempts(cfg.Name)
	if currentAttempts >= 3 {
		slog.Error("Max restart attempts reached", "server", cfg.Name, "attempts", currentAttempts)
		m.processManager.SetStatus(cfg.Name, StatusCrashed)
		return fmt.Errorf("max restart attempts reached")
	}

	// Check if already restarting
	if m.processManager.GetStatus(cfg.Name) == StatusRestarting {
		return fmt.Errorf("server %s is already restarting", cfg.Name)
	}

	// Set status to restarting immediately to prevent duplicate restarts
	m.processManager.SetStatus(cfg.Name, StatusRestarting)

	// Perform restart asynchronously to avoid blocking
	go func() {
		attempts := m.processManager.IncrementRestartAttempts(cfg.Name)

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

		// Check if parent context is already cancelled (e.g., during shutdown)
		// Early exit to avoid unnecessary resource cleanup (session close, process kill) that occurred above
		// and the subsequent reconnection attempt during graceful shutdown
		if ctx.Err() != nil {
			slog.Info("Restart aborted due to context cancellation", "server", cfg.Name)

			// Cancel any existing health check to prevent unnecessary operations during shutdown
			m.mu.Lock()
			if cancel, ok := m.healthCheckCancels[cfg.Name]; ok {
				cancel()
			}
			m.mu.Unlock()

			m.processManager.SetStatus(cfg.Name, StatusCrashed)
			return
		}

		// Attempt reconnection with timeout
		// Use context.WithTimeout to ensure reconnection respects parent context cancellation
		// This allows proper shutdown handling during application termination
		connCtx, connCancel := context.WithTimeout(ctx, 30*time.Second)
		defer connCancel()
		if err := m.connectClient(connCtx, cfg); err != nil {
			slog.Error("Failed to reconnect server", "server", cfg.Name, "error", err)

			// Cancel any existing health check
			m.mu.Lock()
			if cancel, ok := m.healthCheckCancels[cfg.Name]; ok {
				cancel()
			}
			m.mu.Unlock()

			m.processManager.SetStatus(cfg.Name, StatusCrashed)
			return
		}

		// Restart health check after successful reconnection
		m.StartHealthCheck(ctx, cfg.Name)
		slog.Info("Server restarted successfully", "server", cfg.Name, "attempt", attempts)
	}()

	return nil
}
