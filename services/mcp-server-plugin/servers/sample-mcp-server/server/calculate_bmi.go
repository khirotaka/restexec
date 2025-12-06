package server

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type CalculateBMIInput struct {
	WeightKg float64 `json:"weight_kg"`
	HeightM  float64 `json:"height_m"`
}

type CalculateBMIOutput struct {
	Result float64 `json:"result"`
}

func (s *MCPServer) calculateBMIHandler(ctx context.Context, _ *mcp.CallToolRequest, input *CalculateBMIInput) (*mcp.CallToolResult, CalculateBMIOutput, error) {
	if input.HeightM <= 0 || input.WeightKg <= 0 {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "Invalid input: height and weight must be positive values",
				},
			},
		}, CalculateBMIOutput{}, nil
	}
	output := CalculateBMIOutput{
		Result: input.WeightKg / (input.HeightM * input.HeightM),
	}

	return nil, output, nil
}
