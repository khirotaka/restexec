package config

import (
	"os"
	"testing"
)

func TestLoadConfig_HealthCheckInterval(t *testing.T) {
	tests := []struct {
		name             string
		yamlContent      string
		envVar           string
		expectError      bool
		expectedInterval int
	}{
		{
			name: "Valid interval in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 10000`,
			expectError:      false,
			expectedInterval: 10000,
		},
		{
			name: "Boundary value - minimum (5000ms)",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 5000`,
			expectError:      false,
			expectedInterval: 5000,
		},
		{
			name: "Boundary value - maximum (300000ms)",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 300000`,
			expectError:      false,
			expectedInterval: 300000,
		},
		{
			name: "Interval too small in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 4999`,
			expectError: true,
		},
		{
			name: "Interval too large in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 300001`,
			expectError: true,
		},
		{
			name: "Valid interval in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:           "10000",
			expectError:      false,
			expectedInterval: 10000,
		},
		{
			name: "YAML takes precedence over Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 10000`,
			envVar:           "20000",
			expectError:      false,
			expectedInterval: 10000,
		},
		{
			name: "Default value when both unset",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			expectError:      false,
			expectedInterval: 30000,
		},
		{
			name: "Interval too small in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "4999",
			expectError: true,
		},
		{
			name: "Interval too large in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "300001",
			expectError: true,
		},
		{
			name: "Invalid format in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "abc",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			tmpFile := tmpDir + "/config.yaml"
			if err := os.WriteFile(tmpFile, []byte(tt.yamlContent), 0644); err != nil {
				t.Fatalf("failed to create config file: %v", err)
			}

			if tt.envVar != "" {
				t.Setenv("HEALTH_CHECK_INTERVAL", tt.envVar)
			}
			// t.Setenv() handles cleanup automatically

			config, err := LoadConfig(tmpFile)
			if tt.expectError {
				if err == nil {
					t.Error("expected error but got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if tt.expectedInterval != 0 && config.HealthCheckInterval != tt.expectedInterval {
					t.Errorf("expected interval %d, got %d", tt.expectedInterval, config.HealthCheckInterval)
				}
			}
		})
	}
}
