package http

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

// StartServer starts the HTTP server on the specified port
func StartServer(router *gin.Engine, port string) error {
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	slog.Info("Starting server", "address", srv.Addr)

	// 別goroutineでシャットダウンリスナーを起動
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("Server shutdown error", "error", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}
