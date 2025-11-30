package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
)

// StartServer starts the HTTP server on the specified port
func StartServer(router *gin.Engine, port string) error {
	addr := ":" + port
	slog.Info("Starting server", "address", addr)
	return router.Run(addr)
}
