package http

import (
	"github.com/gin-gonic/gin"
)

// SetupRouter configures the Gin engine and routes
func SetupRouter(handler *Handler) *gin.Engine {
	// Create Gin instance
	r := gin.New()

	// Middleware
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// Routes
	r.POST("/mcp/call", handler.CallTool)
	r.GET("/mcp/tools", handler.GetTools)
	r.GET("/health", handler.Health)

	return r
}
