package main

import (
	"context"
	"log/slog"
	"sample-mcp-server/server"
)

func main() {
	server := server.NewMCPServer()
	server.Setup()
	if err := server.Run(context.Background()); err != nil {
		slog.Error("failed to run server", slog.Any("error", err))
	}
}