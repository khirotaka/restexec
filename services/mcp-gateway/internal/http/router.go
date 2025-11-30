package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// SetupRouter configures the Gin engine and routes
func SetupRouter(handler *Handler) *gin.Engine {
	// Create Gin instance
	r := gin.New()

	// Middleware
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(func(c *gin.Context) {
		const maxBodySize = 100 * 1024 // 100KB
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodySize)
		c.Next()
	})

	// Routes
	r.POST("/mcp/call", handler.CallTool)
	r.GET("/mcp/tools", handler.GetTools)
	r.GET("/health", handler.Health)

	return r
}
