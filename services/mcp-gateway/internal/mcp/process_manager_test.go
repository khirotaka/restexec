package mcp

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewProcessManager(t *testing.T) {
	pm := NewProcessManager(30000, "never")

	assert.NotNil(t, pm)
	assert.NotNil(t, pm.statuses)
	assert.Empty(t, pm.statuses)
}

func TestProcessManager_GetStatus(t *testing.T) {
	tests := []struct {
		name       string
		serverName string
		setup      func(*ProcessManager)
		wantStatus ServerStatus
	}{
		{
			name:       "unknown server returns unavailable",
			serverName: "unknown-server",
			setup:      func(pm *ProcessManager) {},
			wantStatus: StatusUnavailable,
		},
		{
			name:       "registered available server returns correct status",
			serverName: "test-server",
			setup: func(pm *ProcessManager) {
				pm.SetStatus("test-server", StatusAvailable)
			},
			wantStatus: StatusAvailable,
		},
		{
			name:       "registered unavailable server returns correct status",
			serverName: "test-server",
			setup: func(pm *ProcessManager) {
				pm.SetStatus("test-server", StatusUnavailable)
			},
			wantStatus: StatusUnavailable,
		},
		{
			name:       "crashed server returns correct status",
			serverName: "test-server",
			setup: func(pm *ProcessManager) {
				pm.SetStatus("test-server", StatusCrashed)
			},
			wantStatus: StatusCrashed,
		},
		{
			name:       "empty server name returns unavailable",
			serverName: "",
			setup:      func(pm *ProcessManager) {},
			wantStatus: StatusUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := NewProcessManager(30000, "never")
			tt.setup(pm)

			status := pm.GetStatus(tt.serverName)
			assert.Equal(t, tt.wantStatus, status)
		})
	}
}

func TestProcessManager_SetStatus(t *testing.T) {
	tests := []struct {
		name       string
		serverName string
		status     ServerStatus
	}{
		{
			name:       "set available status",
			serverName: "server-1",
			status:     StatusAvailable,
		},
		{
			name:       "set unavailable status",
			serverName: "server-2",
			status:     StatusUnavailable,
		},
		{
			name:       "set crashed status",
			serverName: "server-3",
			status:     StatusCrashed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := NewProcessManager(30000, "never")

			pm.SetStatus(tt.serverName, tt.status)
			retrievedStatus := pm.GetStatus(tt.serverName)

			assert.Equal(t, tt.status, retrievedStatus)
		})
	}
}

func TestProcessManager_SetStatus_Overwrite(t *testing.T) {
	pm := NewProcessManager(30000, "never")

	// Set initial status
	pm.SetStatus("test-server", StatusAvailable)
	assert.Equal(t, StatusAvailable, pm.GetStatus("test-server"))

	// Overwrite to crashed
	pm.SetStatus("test-server", StatusCrashed)
	assert.Equal(t, StatusCrashed, pm.GetStatus("test-server"))

	// Overwrite back to available
	pm.SetStatus("test-server", StatusAvailable)
	assert.Equal(t, StatusAvailable, pm.GetStatus("test-server"))
}

func TestProcessManager_GetAllStatuses(t *testing.T) {
	tests := []struct {
		name  string
		setup func(*ProcessManager)
		want  map[string]ServerStatus
	}{
		{
			name:  "empty manager returns empty map",
			setup: func(pm *ProcessManager) {},
			want:  map[string]ServerStatus{},
		},
		{
			name: "returns all registered servers",
			setup: func(pm *ProcessManager) {
				pm.SetStatus("server-1", StatusAvailable)
				pm.SetStatus("server-2", StatusUnavailable)
				pm.SetStatus("server-3", StatusCrashed)
			},
			want: map[string]ServerStatus{
				"server-1": StatusAvailable,
				"server-2": StatusUnavailable,
				"server-3": StatusCrashed,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := NewProcessManager(30000, "never")
			tt.setup(pm)

			statuses := pm.GetAllStatuses()

			assert.Equal(t, tt.want, statuses)
		})
	}
}

func TestProcessManager_GetAllStatuses_IsCopy(t *testing.T) {
	pm := NewProcessManager(30000, "never")
	pm.SetStatus("server-1", StatusAvailable)
	pm.SetStatus("server-2", StatusUnavailable)

	// Get the map
	statuses := pm.GetAllStatuses()
	originalLen := len(statuses)

	// Modify the returned map
	statuses["server-3"] = StatusCrashed
	delete(statuses, "server-1")

	// Verify original is unchanged
	allStatuses := pm.GetAllStatuses()
	assert.Equal(t, originalLen, len(allStatuses))
	assert.Equal(t, StatusAvailable, allStatuses["server-1"])
	assert.NotContains(t, allStatuses, "server-3")
}

func TestProcessManager_GetAllStatuses_ReflectsChanges(t *testing.T) {
	pm := NewProcessManager(30000, "never")
	pm.SetStatus("server-1", StatusAvailable)

	// Get initial state
	statuses1 := pm.GetAllStatuses()
	assert.Len(t, statuses1, 1)

	// Add another server
	pm.SetStatus("server-2", StatusUnavailable)

	// Get new state
	statuses2 := pm.GetAllStatuses()
	assert.Len(t, statuses2, 2)
	assert.Equal(t, StatusAvailable, statuses2["server-1"])
	assert.Equal(t, StatusUnavailable, statuses2["server-2"])
}

func TestProcessManager_Concurrent(t *testing.T) {
	pm := NewProcessManager(30000, "never")

	const numGoroutines = 100
	const numServers = 10

	// Test concurrent writes and reads
	var wg sync.WaitGroup

	// Concurrent SetStatus operations
	for i := range numGoroutines {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			serverName := fmt.Sprintf("server-%d", id%numServers)
			status := StatusAvailable
			if (id % 3) == 0 {
				status = StatusCrashed
			} else if (id % 2) == 0 {
				status = StatusUnavailable
			}
			pm.SetStatus(serverName, status)
		}(i)
	}

	// Concurrent GetStatus operations
	for i := range numGoroutines {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			serverName := fmt.Sprintf("server-%d", id%numServers)
			_ = pm.GetStatus(serverName)
		}(i)
	}

	// Concurrent GetAllStatuses operations
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = pm.GetAllStatuses()
		}()
	}

	wg.Wait()

	// Verify state is consistent
	statuses := pm.GetAllStatuses()
	require.LessOrEqual(t, len(statuses), numServers)

	// All stored statuses should be valid
	for _, status := range statuses {
		assert.Contains(t, []ServerStatus{StatusAvailable, StatusUnavailable, StatusCrashed}, status)
	}
}

func TestProcessManager_Concurrent_RaceDetection(t *testing.T) {
	pm := NewProcessManager(30000, "never")

	// This test specifically targets potential data races
	// Use -race flag when running: go test -race ./...

	var wg sync.WaitGroup
	done := make(chan bool, 1)

	// Writer goroutine
	wg.Go(func() {
		for range 100 {
			pm.SetStatus("server", StatusAvailable)
		}
		done <- true
	})

	// Reader goroutine
	wg.Go(func() {
		for {
			select {
			case <-done:
				return
			default:
				_ = pm.GetStatus("server")
				_ = pm.GetAllStatuses()
			}
		}
	})

	wg.Wait()
}

func TestProcessManager_MultipleServers(t *testing.T) {
	pm := NewProcessManager(30000, "never")

	servers := []string{
		"auth-server",
		"database-server",
		"api-gateway",
		"cache-server",
		"worker-server",
	}

	// Set different statuses for each server
	for i, server := range servers {
		var status ServerStatus
		switch i % 3 {
		case 0:
			status = StatusAvailable
		case 1:
			status = StatusUnavailable
		default:
			status = StatusCrashed
		}
		pm.SetStatus(server, status)
	}

	// Verify all are set correctly
	allStatuses := pm.GetAllStatuses()
	require.Equal(t, len(servers), len(allStatuses))

	for i, server := range servers {
		var expectedStatus ServerStatus
		switch i % 3 {
		case 0:
			expectedStatus = StatusAvailable
		case 1:
			expectedStatus = StatusUnavailable
		default:
			expectedStatus = StatusCrashed
		}
		assert.Equal(t, expectedStatus, allStatuses[server])
	}
}
