package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/validator"
	mcpErrors "github.com/khirotaka/restexec/services/mcp-gateway/pkg/errors"
)

type Handler struct {
	clientManager  *mcp.ClientManager
	processManager *mcp.ProcessManager
	startTime      time.Time
}

func NewHandler(cm *mcp.ClientManager, pm *mcp.ProcessManager) *Handler {
	return &Handler{
		clientManager:  cm,
		processManager: pm,
		startTime:      time.Now(),
	}
}

type CallToolRequest struct {
	Server   string `json:"server"`
	ToolName string `json:"toolName"`
	Input    any    `json:"input"`
}

func (h *Handler) CallTool(c *gin.Context) {
	var req CallToolRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error": gin.H{
				"code":    mcpErrors.ErrCodeValidation,
				"message": err.Error(),
			},
		})
		return
	}

	// Validate request
	if err := validator.ValidateRequest(req.Server, req.ToolName, req.Input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error": gin.H{
				"code":    mcpErrors.ErrCodeValidation,
				"message": err.Error(),
			},
		})
		return
	}

	// Call tool
	// tool info からタイムアウト時間を取得 (デフォルト: 30s)
	var timeout time.Duration

	toolInfo := h.clientManager.GetTools()
	for _, tool := range toolInfo {
		if tool.Name == req.ToolName {
			timeout = time.Duration(tool.Timeout) * time.Millisecond
			break
		}
	}
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	result, err := h.clientManager.CallTool(ctx, req.Server, req.ToolName, req.Input)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			c.JSON(http.StatusGatewayTimeout, gin.H{
				"success": false,
				"error": gin.H{
					"code":    mcpErrors.ErrCodeTimeout,
					"message": fmt.Sprintf("Tool execution timed out after %dms", timeout.Milliseconds()),
					"details": gin.H{
						"toolName":   req.ToolName,
						"serverName": req.Server,
						"timeout":    timeout.Milliseconds(),
					},
				},
			})
			return
		}

		// Map errors (simplified)
		status := http.StatusInternalServerError
		code := mcpErrors.ErrCodeToolExecution

		if errors.Is(err, mcpErrors.ErrServerNotFound) {
			status = http.StatusNotFound
			code = mcpErrors.ErrCodeServerNotFound
		} else if errors.Is(err, mcpErrors.ErrServerNotRunning) {
			status = http.StatusServiceUnavailable
			code = mcpErrors.ErrCodeServerNotRunning
		} else if errors.Is(err, mcpErrors.ErrToolNotFound) {
			status = http.StatusNotFound
			code = mcpErrors.ErrCodeToolNotFound
		}

		c.JSON(status, gin.H{
			"success": false,
			"error": gin.H{
				"code":    code,
				"message": err.Error(),
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

func (h *Handler) GetTools(c *gin.Context) {
	tools := h.clientManager.GetTools()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"tools":   tools,
	})
}

func (h *Handler) Health(c *gin.Context) {
	statuses := h.processManager.GetAllStatuses()
	status := "ok"
	for _, s := range statuses {
		if s != mcp.StatusAvailable {
			status = "degraded"
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"uptime":  time.Since(h.startTime).Seconds(),
		"servers": statuses,
	})
}
