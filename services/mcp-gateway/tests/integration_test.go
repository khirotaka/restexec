package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	internalHttp "github.com/khirotaka/restexec/services/mcp-gateway/internal/http"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration(t *testing.T) {
	// 1. Build the test server
	cwd, err := os.Getwd()
	require.NoError(t, err)

	testServerDir := filepath.Join(cwd, "test_server")
	testServerBin := filepath.Join(testServerDir, "test_server_bin")

	// Clean up previous build if exists
	if err := os.Remove(testServerBin); err != nil && !os.IsNotExist(err) {
		t.Errorf("Failed to clean up test server: %v", err)
	}

	cmd := exec.Command("go", "build", "-o", testServerBin)
	cmd.Dir = testServerDir
	output, err := cmd.CombinedOutput()
	require.NoError(t, err, "Failed to build test server: %s", string(output))
	defer func() {
		if err := os.Remove(testServerBin); err != nil && !os.IsNotExist(err) {
			t.Errorf("Failed to clean up test server: %v", err)
		}
	}()

	// 2. Create temporary config
	configFile, err := os.CreateTemp("", "config-*.yaml")
	require.NoError(t, err)
	defer func() {
		if err := os.Remove(configFile.Name()); err != nil && !os.IsNotExist(err) {
			t.Errorf("Failed to clean up config file: %v", err)
		}
	}()

	configContent := fmt.Sprintf(`
servers:
  - name: test-server
    command: %s
    envs:
      - name: TEST_ENV
        value: test_value
`, testServerBin)

	_, err = configFile.WriteString(configContent)
	require.NoError(t, err)
	if err := configFile.Close(); err != nil {
		t.Errorf("Failed to close config file: %v", err)
	}

	// 3. Start Gateway
	cfg, err := config.LoadConfig(configFile.Name())
	require.NoError(t, err)

	processManager := mcp.NewProcessManager()
	clientManager := mcp.NewClientManager(processManager)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = clientManager.Initialize(ctx, cfg.Servers)
	require.NoError(t, err)
	defer func() {
		if err := clientManager.Close(); err != nil && !os.IsNotExist(err) {
			t.Errorf("Failed to clean up client manager: %v", err)
		}
	}()

	handler := internalHttp.NewHandler(clientManager, processManager)
	gin.SetMode(gin.TestMode)
	router := internalHttp.SetupRouter(handler)

	// Start server on a random port
	// Since StartServer blocks, we run it in a goroutine.
	// We need to know the port. internalHttp.StartServer uses router.Run(":" + port).
	// We can't easily get the port back if we use ":0".
	// So we'll pick a port that is likely free, or just use a fixed one for this test.
	// For better reliability, we could modify StartServer, but let's try fixed port 3002 first.
	port := "3002"
	serverErrCh := make(chan error, 1)
	go func() {
		if err := internalHttp.StartServer(router, port); err != nil {
			serverErrCh <- err
		}
	}()

	// Wait for server to be ready
	baseURL := "http://localhost:" + port
	require.Eventually(t, func() bool {
		resp, err := http.Get(baseURL + "/health")
		if err != nil {
			return false
		}
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Errorf("Failed to close response body: %v", err)
			}
		}()
		return resp.StatusCode == http.StatusOK
	}, 5*time.Second, 100*time.Millisecond, "Server did not start in time")

	// 4. Run Tests

	// Test: List Tools
	t.Run("List Tools", func(t *testing.T) {
		resp, err := http.Get(baseURL + "/mcp/tools")
		require.NoError(t, err)
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Errorf("Failed to close response body: %v", err)
			}
		}()

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)

		var result map[string]any
		err = json.Unmarshal(body, &result)
		require.NoError(t, err)

		// Verify structure - expecting {"success": true, "tools": [...]}
		success, ok := result["success"].(bool)
		require.True(t, ok, "response should contain 'success' field")
		assert.True(t, success)

		tools, ok := result["tools"].([]any)
		require.True(t, ok, "response should contain 'tools' array")
		assert.NotEmpty(t, tools)

		// Check if "calculate-bmi" exists (from the test server)
		found := false
		for _, tool := range tools {
			toolMap, ok := tool.(map[string]any)
			if !ok {
				continue
			}
			if name, ok := toolMap["name"].(string); ok && name == "calculate-bmi" {
				found = true
				break
			}
		}
		assert.True(t, found, "calculate-bmi tool should be present")
	})

	// Test: Call Tool
	t.Run("Call Tool", func(t *testing.T) {
		reqBody := map[string]any{
			"server":   "test-server",
			"toolName": "calculate-bmi",
			"input": map[string]any{
				"height_m":  1.75,
				"weight_kg": 70.0,
			},
		}
		jsonBody, _ := json.Marshal(reqBody)

		resp, err := http.Post(baseURL+"/mcp/call", "application/json", bytes.NewBuffer(jsonBody))
		require.NoError(t, err)
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Errorf("Failed to close response body: %v", err)
			}
		}()

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)

		if resp.StatusCode != http.StatusOK {
			t.Logf("Error response body: %s", string(body))
		}
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result map[string]any
		err = json.Unmarshal(body, &result)
		require.NoError(t, err)

		// Verify response - expecting {"success": true, "result": {...}}
		success, ok := result["success"].(bool)
		require.True(t, ok, "response should contain 'success' field")
		assert.True(t, success)

		_, ok = result["result"]
		require.True(t, ok, "response should contain 'result' field")
	})
	t.Run("Validation Error - Invalid Server Name", func(t *testing.T) {
		reqBody := map[string]any{
			"server":   "invalid@server", // 不正な文字を含む
			"toolName": "calculate-bmi",
			"input":    map[string]any{},
		}
		jsonBody, _ := json.Marshal(reqBody)

		resp, err := http.Post(baseURL+"/mcp/call", "application/json", bytes.NewBuffer(jsonBody))
		require.NoError(t, err)
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Errorf("Failed to close response body: %v", err)
			}
		}()

		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Errorf("Failed to decode response body: %v", err)
		}
		assert.False(t, result["success"].(bool))
		assert.Equal(t, "VALIDATION_ERROR", result["error"].(map[string]any)["code"])
	})

	t.Run("Tool Not Found", func(t *testing.T) {
		reqBody := map[string]any{
			"server":   "test-server",
			"toolName": "non-existent-tool",
			"input":    map[string]any{},
		}
		jsonBody, _ := json.Marshal(reqBody)

		resp, err := http.Post(baseURL+"/mcp/call", "application/json", bytes.NewBuffer(jsonBody))
		require.NoError(t, err)
		defer func() {
			if err := resp.Body.Close(); err != nil {
				t.Errorf("Failed to close response body: %v", err)
			}
		}()

		t.Log(resp.Status)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
}
