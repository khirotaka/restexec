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
	output := CalculateBMIOutput{
		Result: input.WeightKg / (input.HeightM * input.HeightM),
	}

	return nil, output, nil
}
