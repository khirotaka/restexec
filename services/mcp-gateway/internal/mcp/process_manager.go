package mcp

import (
	"maps"
	"sync"
	"time"
)

// ServerStatus represents the status of an MCP server
type ServerStatus string

const (
	StatusAvailable   ServerStatus = "available"
	StatusUnavailable ServerStatus = "unavailable"
	StatusCrashed     ServerStatus = "crashed"
	StatusRestarting  ServerStatus = "restarting"
)

// ProcessManager manages the status of MCP server processes
type ProcessManager struct {
	statuses            map[string]ServerStatus
	healthCheckInterval int
	restartPolicy       string
	restartAttempts     map[string]int
	mu                  sync.RWMutex

	// Callback for restart notification
	onServerCrashed func(serverName string)
}

// NewProcessManager creates a new ProcessManager
func NewProcessManager(healthCheckInterval int, restartPolicy string) *ProcessManager {
	return &ProcessManager{
		statuses:            make(map[string]ServerStatus),
		healthCheckInterval: healthCheckInterval,
		restartPolicy:       restartPolicy,
		restartAttempts:     make(map[string]int),
	}
}

// GetStatus returns the current status of a server
func (p *ProcessManager) GetStatus(serverName string) ServerStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()

	status, ok := p.statuses[serverName]
	if !ok {
		return StatusUnavailable
	}
	return status
}

// SetStatus updates the status of a server
func (p *ProcessManager) SetStatus(serverName string, status ServerStatus) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.statuses[serverName] = status
}

// CompareAndSwapStatus atomically updates the status only if the current status matches expected
// Returns true if the swap was successful, false otherwise
func (p *ProcessManager) CompareAndSwapStatus(serverName string, expected, new ServerStatus) bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	current, ok := p.statuses[serverName]
	if !ok {
		current = StatusUnavailable
	}

	if current == expected {
		p.statuses[serverName] = new
		return true
	}
	return false
}

// GetAllStatuses returns a map of all server statuses
func (p *ProcessManager) GetAllStatuses() map[string]ServerStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()

	statuses := make(map[string]ServerStatus, len(p.statuses))
	maps.Copy(statuses, p.statuses)
	return statuses
}

// SetOnServerCrashed sets the callback for when a server crashes
func (p *ProcessManager) SetOnServerCrashed(callback func(serverName string)) {
	p.onServerCrashed = callback
}

// GetRestartAttempts returns the number of restart attempts for a server
func (p *ProcessManager) GetRestartAttempts(serverName string) int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.restartAttempts[serverName]
}

// IncrementRestartAttempts increments and returns the restart attempt count
func (p *ProcessManager) IncrementRestartAttempts(serverName string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.restartAttempts[serverName]++
	return p.restartAttempts[serverName]
}

// ResetRestartAttempts resets the restart counter after successful recovery
func (p *ProcessManager) ResetRestartAttempts(serverName string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.restartAttempts[serverName] = 0
}

// CalculateBackoff returns exponential backoff duration
// attempt 1: 1s, attempt 2: 2s, attempt 3: 4s, attempt 4+: 4s (max)
func (p *ProcessManager) CalculateBackoff(attempt int) time.Duration {
	if attempt <= 0 {
		return time.Second
	}
	// Cap at 3 to ensure max backoff is 4s
	if attempt > 3 {
		attempt = 3
	}
	return time.Duration(1<<uint(attempt-1)) * time.Second
}
