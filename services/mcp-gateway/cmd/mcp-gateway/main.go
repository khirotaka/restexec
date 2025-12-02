package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/khirotaka/restexec/services/mcp-gateway/internal/config"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/http"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
)

func main() {
	// Setup logger
	setupLogger()

	// Load configuration
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/config.yaml"
	}
	slog.Info("Loading configuration", "path", configPath)

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	// Initialize managers
	processManager := mcp.NewProcessManager()
	clientManager := mcp.NewClientManager(processManager)

	// Connect to MCP servers
	// Note: This context only controls the connection establishment timeout.
	// MCP server processes themselves will continue to run.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	slog.Info("Connecting to MCP servers...")
	if err := clientManager.Initialize(ctx, cfg.Servers); err != nil {
		slog.Error("Failed to initialize MCP clients", "error", err)
		_ = clientManager.Close()
		os.Exit(1)
	}
	slog.Info("Connected to MCP servers")

	// Setup HTTP server
	handler := http.NewHandler(clientManager, processManager)
	router := http.SetupRouter(handler)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	serverManager := http.NewServerManager(router, port)
	serverErr := make(chan error, 1)
	go func() {
		if err := serverManager.Start(); err != nil {
			slog.Error("Server failed", "error", err)
			serverErr <- err
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-quit:
		slog.Info("Shutting down server...")
		if err := serverManager.Shutdown(); err != nil {
			slog.Error("Failed to shutdown server", "error", err)
		}
	case err := <-serverErr:
		slog.Error("Server startup failed", "error", err)
		_ = clientManager.Close()
		os.Exit(1)
	}

	// Cleanup
	if err := clientManager.Close(); err != nil {
		slog.Error("Error closing clients", "error", err)
	}

	slog.Info("Server exited")
}

func setupLogger() {
	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		opts.Level = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, opts))
	slog.SetDefault(logger)
}
