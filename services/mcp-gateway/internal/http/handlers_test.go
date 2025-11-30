package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCallToolRequest_JSONUnmarshaling tests the request structure.
func TestCallToolRequest_JSONUnmarshaling(t *testing.T) {
	tests := []struct {
		name      string
		jsonBody  string
		wantErr   bool
		wantValid bool
	}{
		{
			name:      "valid request",
			jsonBody:  `{"server":"test","toolName":"calc","input":{}}`,
			wantErr:   false,
			wantValid: true,
		},
		{
			name:      "invalid JSON",
			jsonBody:  `{invalid json}`,
			wantErr:   true,
			wantValid: false,
		},
		{
			name:      "missing fields",
			jsonBody:  `{"server":"test"}`,
			wantErr:   false,
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CallToolRequest
			err := json.Unmarshal([]byte(tt.jsonBody), &req)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestHandler_Health_AllAvailable tests health endpoint when all servers are available.
func TestHandler_Health_AllAvailable(t *testing.T) {
	pm := mcp.NewProcessManager()
	pm.SetStatus("server-1", mcp.StatusAvailable)
	pm.SetStatus("server-2", mcp.StatusAvailable)

	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.Health(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "ok", resp["status"])
	assert.NotNil(t, resp["uptime"])
	assert.NotNil(t, resp["servers"])
}

// TestHandler_Health_OneUnavailable tests health endpoint with one unavailable server.
func TestHandler_Health_OneUnavailable(t *testing.T) {
	pm := mcp.NewProcessManager()
	pm.SetStatus("server-1", mcp.StatusAvailable)
	pm.SetStatus("server-2", mcp.StatusUnavailable)

	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.Health(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "degraded", resp["status"])
}

// TestHandler_Health_OneCrashed tests health endpoint with one crashed server.
func TestHandler_Health_OneCrashed(t *testing.T) {
	pm := mcp.NewProcessManager()
	pm.SetStatus("server-1", mcp.StatusAvailable)
	pm.SetStatus("server-2", mcp.StatusCrashed)

	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.Health(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "degraded", resp["status"])
}

// TestHandler_Health_NoServers tests health endpoint with no servers registered.
func TestHandler_Health_NoServers(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.Health(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "ok", resp["status"])
}

// TestHandler_GetTools_Empty tests GetTools with no tools.
func TestHandler_GetTools_Empty(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodGet, "/mcp/tools", nil)
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.GetTools(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp["success"].(bool))
	assert.NotNil(t, resp["tools"])

	tools := resp["tools"].([]any)
	assert.Len(t, tools, 0)
}

// TestHandler_CallTool_InvalidJSON tests CallTool with invalid JSON.
func TestHandler_CallTool_InvalidJSON(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", strings.NewReader("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
	assert.Equal(t, "VALIDATION_ERROR", resp["error"].(map[string]any)["code"])
}

// TestHandler_CallTool_EmptyServer tests CallTool with empty server name.
func TestHandler_CallTool_EmptyServer(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "",
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_EmptyToolName tests CallTool with empty tool name.
func TestHandler_CallTool_EmptyToolName(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": "",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_InvalidServerChars tests CallTool with invalid characters in server name.
func TestHandler_CallTool_InvalidServerChars(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "invalid server!",
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_ServerTooLong tests CallTool with server name exceeding max length.
func TestHandler_CallTool_ServerTooLong(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	longServer := strings.Repeat("a", 51)

	reqBody := map[string]any{
		"server":   longServer,
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_ToolNameTooLong tests CallTool with tool name exceeding max length.
func TestHandler_CallTool_ToolNameTooLong(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	longToolName := strings.Repeat("a", 101)

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": longToolName,
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_InputNotObject tests CallTool with non-object input.
func TestHandler_CallTool_InputNotObject(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": "test",
		"input":    "string-value",
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_InputTooDeep tests CallTool with deeply nested input.
func TestHandler_CallTool_InputTooDeep(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	// Create deeply nested input (12+ levels)
	deepInput := map[string]any{
		"l1": map[string]any{
			"l2": map[string]any{
				"l3": map[string]any{
					"l4": map[string]any{
						"l5": map[string]any{
							"l6": map[string]any{
								"l7": map[string]any{
									"l8": map[string]any{
										"l9": map[string]any{
											"l10": map[string]any{
												"l11": map[string]any{
													"l12": map[string]any{
														"l13": "value",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": "test",
		"input":    deepInput,
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
}

// TestHandler_CallTool_ServerNotFound tests CallTool with nonexistent server.
func TestHandler_CallTool_ServerNotFound(t *testing.T) {
	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "nonexistent",
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
	assert.Equal(t, "SERVER_NOT_FOUND", resp["error"].(map[string]any)["code"])
}

// TestHandler_CallTool_ServerUnavailable tests CallTool with unavailable server.
// Note: Without an actual MCP server session, CallTool will fail with "server not found"
// This is a limitation of unit testing ClientManager in isolation.
// Full testing of unavailable/crashed status is covered in integration tests.
func TestHandler_CallTool_ServerUnavailable(t *testing.T) {
	pm := mcp.NewProcessManager()
	pm.SetStatus("test-server", mcp.StatusUnavailable)
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	// Since ClientManager.CallTool checks session existence before status,
	// and we don't have an initialized session, it returns "server not found"
	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
	assert.Equal(t, "SERVER_NOT_FOUND", resp["error"].(map[string]any)["code"])
}

// TestHandler_CallTool_ServerCrashed tests CallTool with crashed server.
// Note: Without an actual MCP server session, CallTool will fail with "server not found"
// This is a limitation of unit testing ClientManager in isolation.
// Full testing of unavailable/crashed status is covered in integration tests.
func TestHandler_CallTool_ServerCrashed(t *testing.T) {
	pm := mcp.NewProcessManager()
	pm.SetStatus("test-server", mcp.StatusCrashed)
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	reqBody := map[string]any{
		"server":   "test-server",
		"toolName": "test",
		"input":    map[string]any{},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/mcp/call", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	handler.CallTool(c)

	// Since ClientManager.CallTool checks session existence before status,
	// and we don't have an initialized session, it returns "server not found"
	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.False(t, resp["success"].(bool))
	assert.Equal(t, "SERVER_NOT_FOUND", resp["error"].(map[string]any)["code"])
}
