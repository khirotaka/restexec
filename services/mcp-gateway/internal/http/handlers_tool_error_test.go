package http

import (
	"testing"

	mcpSDK "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
)

func TestExtractErrorMessage_Success(t *testing.T) {
	result := &mcpSDK.CallToolResult{
		IsError: true,
		Content: []mcpSDK.Content{
			&mcpSDK.TextContent{
				Text: "Invalid city.",
			},
		},
	}

	msg, isError := extractErrorMessage(result)
	assert.True(t, isError)
	assert.Equal(t, "Invalid city.", msg)
}

func TestExtractErrorMessage_EmptyContent(t *testing.T) {
	result := &mcpSDK.CallToolResult{
		IsError: true,
		Content: []mcpSDK.Content{},
	}

	msg, isError := extractErrorMessage(result)
	assert.True(t, isError)
	assert.Equal(t, "Tool execution failed", msg)
}

func TestExtractErrorMessage_NonTextContent(t *testing.T) {
	result := &mcpSDK.CallToolResult{
		IsError: true,
		Content: []mcpSDK.Content{
			&mcpSDK.ImageContent{
				Data:     []byte("base64data"),
				MIMEType: "image/png",
			},
		},
	}

	msg, isError := extractErrorMessage(result)
	assert.True(t, isError)
	assert.Equal(t, "Tool execution failed", msg)
}

func TestExtractErrorMessage_IsErrorFalse(t *testing.T) {
	result := &mcpSDK.CallToolResult{
		IsError: false,
		Content: []mcpSDK.Content{
			&mcpSDK.TextContent{
				Text: "Success result",
			},
		},
	}

	msg, isError := extractErrorMessage(result)
	assert.False(t, isError)
	assert.Equal(t, "", msg)
}

func TestExtractErrorMessage_InvalidType(t *testing.T) {
	result := "not a CallToolResult"

	msg, isError := extractErrorMessage(result)
	assert.False(t, isError)
	assert.Equal(t, "", msg)
}

func TestExtractErrorMessage_EmptyText(t *testing.T) {
	result := &mcpSDK.CallToolResult{
		IsError: true,
		Content: []mcpSDK.Content{
			&mcpSDK.TextContent{
				Text: "",
			},
		},
	}

	msg, isError := extractErrorMessage(result)
	assert.True(t, isError)
	assert.Equal(t, "Tool execution failed", msg)
}
