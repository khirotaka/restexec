package config

import (
	"os"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	// 一時ディレクトリを生成
	tmpDir := t.TempDir()
	t.Setenv("API_KEY", "secret-key-12345")

	// config.yaml の内容を生成し、一時ディレクトリに保存
	configContent := `servers:
  - name: weather-server
    command: /mcp-servers/weather/server
    args: ['--port', '8080', '--path', '/some path']
    envs:
      - name: API_KEY
        value: ${API_KEY}
      - name: DEBUG_MODE
        value: 'true'
    timeout: 30000

  - name: database-server
    command: /mcp-servers/database/server
    timeout: 60000

  - name: health-server
    command: /mcp-servers/health/server`

	// 一時ファイルを生成
	tmpFile := tmpDir + "/config.yaml"
	if err := os.WriteFile(tmpFile, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create config file: %v", err)
	}

	config, err := LoadConfig(tmpFile)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}
	if len(config.Servers) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(config.Servers))
	}
	if config.Servers[0].Name != "weather-server" {
		t.Fatalf("expected server name weather-server, got %s", config.Servers[0].Name)
	}
	if config.Servers[0].Command != "/mcp-servers/weather/server" {
		t.Fatalf("expected server command /mcp-servers/weather/server, got %s", config.Servers[0].Command)
	}
	// args [--port, 8080, --path, /some path]
	if len(config.Servers[0].Args) != 4 {
		t.Fatalf("expected 4 args, got %d", len(config.Servers[0].Args))
	}
	if config.Servers[0].Args[0] != "--port" {
		t.Fatalf("expected arg-1, got %s", config.Servers[0].Args[0])
	}
	if config.Servers[0].Args[1] != "8080" {
		t.Fatalf("expected arg-2, got %s", config.Servers[0].Args[1])
	}
	if config.Servers[0].Args[2] != "--path" {
		t.Fatalf("expected arg-3, got %s", config.Servers[0].Args[2])
	}
	if config.Servers[0].Args[3] != "/some path" {
		t.Fatalf("expected arg-4, got %s", config.Servers[0].Args[3])
	}
	// envs [API_KEY, secret-key-12345, DEBUG_MODE, true]
	if len(config.Servers[0].Envs) != 2 {
		t.Fatalf("expected 2 envs, got %d", len(config.Servers[0].Envs))
	}
	if config.Servers[0].Envs[0].Name != "API_KEY" {
		t.Fatalf("expected env-1, got %s", config.Servers[0].Envs[0].Name)
	}
	if config.Servers[0].Envs[0].Value != "secret-key-12345" {
		t.Fatalf("expected value-1, got %s", config.Servers[0].Envs[0].Value)
	}
	if config.Servers[0].Envs[1].Name != "DEBUG_MODE" {
		t.Fatalf("expected env-2, got %s", config.Servers[0].Envs[1].Name)
	}
	if config.Servers[0].Envs[1].Value != "true" {
		t.Fatalf("expected value-2, got %s", config.Servers[0].Envs[1].Value)
	}
	if config.Servers[0].Timeout != 30000 {
		t.Fatalf("expected timeout 30000, got %d", config.Servers[0].Timeout)
	}
}
