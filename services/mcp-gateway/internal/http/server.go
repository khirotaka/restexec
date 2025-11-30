package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ServerManager handles HTTP server lifecycle
type ServerManager struct {
	srv *http.Server
}

// NewServerManager creates a new server manager
func NewServerManager(router *gin.Engine, port string) *ServerManager {
	return &ServerManager{
		srv: &http.Server{
			Addr:    ":" + port,
			Handler: router,
		},
	}
}

// Start starts the HTTP server
func (sm *ServerManager) Start() error {
	slog.Info("Starting server", "address", sm.srv.Addr)

	if err := sm.srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown gracefully shuts down the HTTP server
func (sm *ServerManager) Shutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := sm.srv.Shutdown(ctx); err != nil {
		slog.Error("Server shutdown error", "error", err)
		return err
	}
	return nil
}

// StartServer starts the HTTP server on the specified port
// Deprecated: Use ServerManager instead
func StartServer(router *gin.Engine, port string) error {
	sm := NewServerManager(router, port)
	return sm.Start()
}
