package config

import (
	"fmt"
	"os"

	"github.com/go-playground/validator/v10"
	"github.com/goccy/go-yaml"
)

// Config represents the root configuration structure
type Config struct {
	Servers []ServerConfig `yaml:"servers" validate:"required,min=1,dive"`
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
