package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/goccy/go-yaml"
)

// Config represents the root configuration structure
type Config struct {
	Servers             []ServerConfig `yaml:"servers" validate:"required,min=1,dive"`
	HealthCheckInterval int            `yaml:"healthCheckInterval"`
	RestartPolicy       string         `yaml:"restartPolicy"`
}

// ServerConfig represents a single MCP server configuration
type ServerConfig struct {
	Name    string   `yaml:"name" validate:"required,hostname_rfc1123,max=50"`
	Command string   `yaml:"command" validate:"required"`
	Args    []string `yaml:"args"`
	Envs    []EnvVar `yaml:"envs" validate:"dive"`
	Timeout int      `yaml:"timeout" validate:"min=0,max=300000"` // Max 5 minutes
}

// EnvVar represents an environment variable for the server
type EnvVar struct {
	Name  string `yaml:"name" validate:"required,printascii"`
	Value string `yaml:"value"`
}

// LoadConfig loads and validates the configuration from the specified path
func LoadConfig(path string) (*Config, error) {
	// Read file
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Expand environment variables
	expandedData := os.ExpandEnv(string(data))

	// Parse YAML
	var config Config
	if err := yaml.Unmarshal([]byte(expandedData), &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Set default timeout if not specified
	for i := range config.Servers {
		if config.Servers[i].Timeout == 0 {
			config.Servers[i].Timeout = 30000 // 30秒をデフォルトに
		}
	}

	// Load health check interval from environment variable
	if config.HealthCheckInterval == 0 {
		if intervalStr := os.Getenv("HEALTH_CHECK_INTERVAL"); intervalStr != "" {
			if interval, err := strconv.Atoi(intervalStr); err == nil {
				if interval < 5000 || interval > 300000 { // 5s to 5min
					return nil, fmt.Errorf("invalid HEALTH_CHECK_INTERVAL: %d (must be between 5000 and 300000)", interval)
				}
				config.HealthCheckInterval = interval
			} else {
				return nil, fmt.Errorf("invalid HEALTH_CHECK_INTERVAL format: %s", intervalStr)
			}
		}
		if config.HealthCheckInterval == 0 {
			config.HealthCheckInterval = 30000 // default 30s
		}
	}

	// Load restart policy from environment variable
	// Precedence: YAML > Env > Default
	if config.RestartPolicy == "" {
		config.RestartPolicy = os.Getenv("MCP_SERVER_RESTART_POLICY")
		if config.RestartPolicy == "" {
			config.RestartPolicy = "never" // default
		}
	}

	// Validate restart policy
	if config.RestartPolicy != "never" && config.RestartPolicy != "on-failure" {
		return nil, fmt.Errorf("invalid restart policy: %s (must be 'never' or 'on-failure')", config.RestartPolicy)
	}

	// Validate config
	validate := validator.New()
	if err := validate.Struct(&config); err != nil {
		return nil, fmt.Errorf("config validation failed: %w", err)
	}

	// Check for duplicate server names
	serverNames := make(map[string]bool)
	for _, server := range config.Servers {
		if serverNames[server.Name] {
			return nil, fmt.Errorf("duplicate server name found: %s", server.Name)
		}
		serverNames[server.Name] = true
	}

	return &config, nil
}
