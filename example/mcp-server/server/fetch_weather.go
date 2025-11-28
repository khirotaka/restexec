package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const openWeatherMapURL string = "https://api.openweathermap.org/data/2.5/weather"

type OpenWeatherMapResponse struct {
	Weather []struct {
		Main        string `json:"main"`
		Description string `json:"description"`
	} `json:"weather"`
	Main struct {
		Temp float64 `json:"temp"`
	} `json:"main"`
}

type FetchWeatherInput struct {
	City string `json:"city" jsonschema:"city は Tokyo, Nagoya, Osaka, Fukuoka のみ選択可能。"`
}

type FetchWeatherOutput struct {
	Temperature float64 `json:"temperature"`
	Conditions  string  `json:"conditions"`
	Description string  `json:"description"`
}

func (s *MCPServer) fetchWeatherHandler(ctx context.Context, _ *mcp.CallToolRequest, input *FetchWeatherInput) (*mcp.CallToolResult, FetchWeatherOutput, error) {
	city := strings.ToLower(input.City)
	// city は Tokyo, Nagoya, Osaka, Fukuoka のみ選択可能。それ以外はエラーを返す
	if city != "tokyo" && city != "nagoya" && city != "osaka" && city != "fukuoka" {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "Invalid city.",
				},
			},
		}, FetchWeatherOutput{}, nil
	}

	var (
		cityLat float32 // 緯度
		cityLon float32 // 経度
	)
	switch city {
	case "tokyo":
		cityLat = 35.6812996
		cityLon = 139.7670658
	case "nagoya":
		cityLat = 35.170915
		cityLon = 136.8815369
	case "osaka":
		cityLat = 34.7024854
		cityLon = 135.4959506
	case "fukuoka":
		cityLat = 33.5904
		cityLon = 130.4017
	}

	// Open Weather Map にリクエストを投げる
	apiKey, ok := os.LookupEnv("OPEN_WEATHER_MAP_API_KEY")
	if !ok {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "OPEN_WEATHER_MAP_API_KEY is not set.",
				},
			},
		}, FetchWeatherOutput{}, nil
	}
	address := fmt.Sprintf("%s?lat=%f&lon=%f&appid=%s&units=metric", openWeatherMapURL, cityLat, cityLon, apiKey)
	resp, err := http.Get(address)
	if err != nil {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "failed to fetch weather: " + err.Error(),
				},
			},
		}, FetchWeatherOutput{}, nil
	}
	defer resp.Body.Close()

	var weatherData OpenWeatherMapResponse
	if err := json.NewDecoder(resp.Body).Decode(&weatherData); err != nil {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "failed to decode response: " + err.Error(),
				},
			},
		}, FetchWeatherOutput{}, nil
	}

	if len(weatherData.Weather) == 0 {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{
				&mcp.TextContent{
					Text: "no weather data in response",
				},
			},
		}, FetchWeatherOutput{}, nil
	}

	output := FetchWeatherOutput{
		Temperature: weatherData.Main.Temp,
		Conditions:  weatherData.Weather[0].Main,
		Description: weatherData.Weather[0].Description,
	}

	return nil, output, nil
}
