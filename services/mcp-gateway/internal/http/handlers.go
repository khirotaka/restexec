package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/validator"
)

type Handler struct {
	clientManager  *mcp.ClientManager
	processManager *mcp.ProcessManager
}

func NewHandler(cm *mcp.ClientManager, pm *mcp.ProcessManager) *Handler {
	return &Handler{
		clientManager:  cm,
		processManager: pm,
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
				"code":    "VALIDATION_ERROR",
				"message": "Invalid JSON body",
			},
		})
		return
	}

	// Validate request
	if err := validator.ValidateRequest(req.Server, req.ToolName, req.Input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": err.Error(),
			},
		})
		return
	}

	// Call tool
	// TODO: Get timeout from config or use default
	ctx := c.Request.Context()
	result, err := h.clientManager.CallTool(ctx, req.Server, req.ToolName, req.Input)
	if err != nil {
		// Map errors (simplified)
		status := http.StatusInternalServerError
		code := "TOOL_EXECUTION_ERROR"

		if err.Error() == "server not found" {
			status = http.StatusNotFound
			code = "SERVER_NOT_FOUND"
		} else if err.Error() == "server is unavailable" || err.Error() == "server is crashed" {
			status = http.StatusServiceUnavailable
			code = "SERVER_NOT_RUNNING"
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
		"uptime":  time.Since(startTime).Seconds(), // Need to define startTime
		"servers": statuses,
	})
}

var startTime = time.Now()
