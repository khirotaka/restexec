package mcp

import (
	"maps"
	"sync"
)

// ServerStatus represents the status of an MCP server
type ServerStatus string

const (
	StatusAvailable   ServerStatus = "available"
	StatusUnavailable ServerStatus = "unavailable"
	StatusCrashed     ServerStatus = "crashed"
)

// ProcessManager manages the status of MCP server processes
type ProcessManager struct {
	statuses map[string]ServerStatus
	mu       sync.RWMutex
}

// NewProcessManager creates a new ProcessManager
func NewProcessManager() *ProcessManager {
	return &ProcessManager{
		statuses: make(map[string]ServerStatus),
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

// GetAllStatuses returns a map of all server statuses
func (p *ProcessManager) GetAllStatuses() map[string]ServerStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()

	statuses := make(map[string]ServerStatus, len(p.statuses))
	maps.Copy(statuses, p.statuses)
	return statuses
}
