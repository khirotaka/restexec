package server

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type MCPServer struct {
	server *mcp.Server
}

func NewMCPServer() *MCPServer {
	mcpServer := mcp.NewServer(
		&mcp.Implementation{Name: "sample-mcp-server", Version: "1.0.0"},
		nil,
	)
	return &MCPServer{
		server: mcpServer,
	}
}

func (s *MCPServer) Setup() {
	mcp.AddTool(
		s.server,
		&mcp.Tool{
			Name:        "calculate-bmi",
			Title:       "BMI Calculator",
			Description: "Calculate Body Mass Index",
		},
		s.calculateBMIHandler,
	)
	mcp.AddTool(
		s.server,
		&mcp.Tool{
			Name:        "fetch-weather",
			Title:       "Weather Fetcher",
			Description: "Get weather data for a city",
		},
		s.fetchWeatherHandler,
	)
}

func (s *MCPServer) Run(ctx context.Context) error {
	return s.server.Run(ctx, &mcp.StdioTransport{})
}
