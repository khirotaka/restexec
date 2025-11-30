package http

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSetupRouter verifies that the router is configured with the expected routes.
func TestSetupRouter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	router := SetupRouter(handler)

	routes := router.Routes()

	// Expected routes: method + path
	expectedRoutes := map[string]bool{
		"POST /mcp/call": false,
		"GET /mcp/tools": false,
		"GET /health":    false,
	}

	// Check that all expected routes exist
	for _, route := range routes {
		key := route.Method + " " + route.Path
		if _, ok := expectedRoutes[key]; ok {
			expectedRoutes[key] = true
		}
	}

	// Verify all expected routes were found
	for route, found := range expectedRoutes {
		assert.True(t, found, "route %s should be registered", route)
	}
}

// TestSetupRouter_CallToolRoute verifies the /mcp/call POST route exists.
func TestSetupRouter_CallToolRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	router := SetupRouter(handler)

	routes := router.Routes()

	found := false
	for _, route := range routes {
		if route.Method == "POST" && route.Path == "/mcp/call" {
			found = true
			break
		}
	}

	require.True(t, found, "POST /mcp/call route should be registered")
}

// TestSetupRouter_GetToolsRoute verifies the /mcp/tools GET route exists.
func TestSetupRouter_GetToolsRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	router := SetupRouter(handler)

	routes := router.Routes()

	found := false
	for _, route := range routes {
		if route.Method == "GET" && route.Path == "/mcp/tools" {
			found = true
			break
		}
	}

	require.True(t, found, "GET /mcp/tools route should be registered")
}

// TestSetupRouter_HealthRoute verifies the /health GET route exists.
func TestSetupRouter_HealthRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	pm := mcp.NewProcessManager()
	cm := mcp.NewClientManager(pm)
	handler := NewHandler(cm, pm)

	router := SetupRouter(handler)

	routes := router.Routes()

	found := false
	for _, route := range routes {
		if route.Method == "GET" && route.Path == "/health" {
			found = true
			break
		}
	}

	require.True(t, found, "GET /health route should be registered")
}
