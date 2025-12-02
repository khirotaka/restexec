package http

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/mcp"
	"github.com/khirotaka/restexec/services/mcp-gateway/internal/validator"
	mcpErrors "github.com/khirotaka/restexec/services/mcp-gateway/pkg/errors"
	mcpSDK "github.com/modelcontextprotocol/go-sdk/mcp"
)

// isUnknownToolError checks if the error is from an unknown tool call
// The MCP SDK returns an error with the message pattern:
// "calling "tools/call": unknown tool "toolName""
func isUnknownToolError(err error) bool {
	errMsg := err.Error()
	return strings.Contains(errMsg, "unknown tool")
}

// extractErrorMessage extracts error message from CallToolResult Content.
// Returns the error message and true if result is an error, empty string and false otherwise.
func extractErrorMessage(result any) (string, bool) {
	// Type assert to MCP CallToolResult
	toolResult, ok := result.(*mcpSDK.CallToolResult)
	if !ok {
		slog.Warn("Unexpected result type from CallTool",
			"type", fmt.Sprintf("%T", result),
			"expected", "*mcpSDK.CallToolResult",
		)
		return "", false
	}

	// Check if this is a tool error
	if !toolResult.IsError {
		return "", false
	}

	// Extract text from first content item
	if len(toolResult.Content) > 0 {
		for _, content := range toolResult.Content {
			// TODO: Handle non-text content types
			// - AudioContent: Return base64-encoded data or URL
			// - ImageContent: Return base64-encoded data or URL
			// For now, we only extract text content and treat other types as unexpected
			if textContent, ok := content.(*mcpSDK.TextContent); ok && textContent.Text != "" {
				return textContent.Text, true
			}
		}
	}

	// Fallback if Content is empty or not TextContent
	if len(toolResult.Content) == 0 {
		return "Tool execution failed: no error details provided", true
	}

	return fmt.Sprintf("Tool execution failed: unexpected content type: %T", toolResult.Content[0]), true
}

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

	if toolInfo, found := h.clientManager.GetToolInfo(req.Server, req.ToolName); found {
		timeout = time.Duration(toolInfo.Timeout) * time.Millisecond
	} else {
		slog.Warn("Tool not found in cache, using default timeout", "toolName", req.ToolName, "server", req.Server)
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
		} else if errors.Is(err, mcpErrors.ErrServerCrashed) {
			status = http.StatusBadGateway
			code = mcpErrors.ErrCodeServerCrashed
		} else if isUnknownToolError(err) {
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

	// Check if tool returned an error (MCP-level tool error)
	if errMsg, isToolError := extractErrorMessage(result); isToolError {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error": gin.H{
				"code":    mcpErrors.ErrCodeToolExecution,
				"message": errMsg,
				"details": gin.H{
					"toolName":   req.ToolName,
					"serverName": req.Server,
				},
			},
		})
		return
	}

	// Success case
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
