package http

import (
	"fmt"

	"github.com/gin-gonic/gin"
)

// StartServer starts the HTTP server on the specified port
func StartServer(router *gin.Engine, port string) error {
	addr := ":" + port
	fmt.Printf("Starting server on %s\n", addr)
	return router.Run(addr)
}
