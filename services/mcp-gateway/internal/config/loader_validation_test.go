package config

import (
	"os"
	"testing"
)

func TestLoadConfig_HealthCheckInterval(t *testing.T) {
	tests := []struct {
		name        string
		yamlContent string
		envVar      string
		expectError bool
	}{
		{
			name: "Valid interval in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 10000`,
			expectError: false,
		},
		{
			name: "Interval too small in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 1000`,
			expectError: true,
		},
		{
			name: "Interval too large in YAML",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true
healthCheckInterval: 400000`,
			expectError: true,
		},
		{
			name: "Valid interval in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "10000",
			expectError: false,
		},
		{
			name: "Interval too small in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "1000",
			expectError: true,
		},
		{
			name: "Interval too large in Env",
			yamlContent: `
servers:
  - name: test-server
    command: /bin/true`,
			envVar:      "400000",
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
			} else {
				if err := os.Unsetenv("HEALTH_CHECK_INTERVAL"); err != nil {
					t.Fatalf("failed to unset env: %v", err)
				}
			}

			_, err := LoadConfig(tmpFile)
			if tt.expectError && err == nil {
				t.Error("expected error but got nil")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}
