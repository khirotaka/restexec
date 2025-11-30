package validator

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

const (
	maxInputSize = 100 * 1024 // 100KB
	maxNestDepth = 10
)

var (
	namePattern   = regexp.MustCompile(`^[a-zA-Z0-9-_]+$`)
	dangerousKeys = []string{"__proto__", "constructor", "prototype"}
)

func containsDangerousKeys(obj any) bool {
	switch v := obj.(type) {
	case map[string]any:
		for key, val := range v {
			// キー名自体をチェック
			if slices.Contains(dangerousKeys, key) {
				return true
			}
			// 値を再帰的にチェック
			if containsDangerousKeys(val) {
				return true
			}
		}
	case []any:
		if slices.ContainsFunc(v, containsDangerousKeys) {
			return true
		}
	}
	return false
}

// ValidateRequest validates the MCP tool call request parameters
func ValidateRequest(server, toolName string, input any) error {
	if err := validateName(server, "server", 50); err != nil {
		return err
	}
	if err := validateName(toolName, "toolName", 100); err != nil {
		return err
	}
	if err := validateInput(input); err != nil {
		return err
	}
	return nil
}

func validateName(name, field string, maxLength int) error {
	if name == "" {
		return fmt.Errorf("%s is required", field)
	}
	if len(name) > maxLength {
		return fmt.Errorf("%s exceeds maximum length (%d characters)", field, maxLength)
	}
	if !namePattern.MatchString(name) {
		return fmt.Errorf("%s contains invalid characters", field)
	}
	return nil
}

func validateInput(input any) error {
	// Check if input is a map (JSON object)
	inputMap, ok := input.(map[string]any)
	if !ok {
		return errors.New("input must be a JSON object")
	}

	if containsDangerousKeys(inputMap) {
		return errors.New("input contains forbidden keys")
	}

	// Check size
	jsonBytes, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("failed to marshal input: %w", err)
	}
	if len(jsonBytes) > maxInputSize {
		return fmt.Errorf("input exceeds maximum size (%d bytes)", maxInputSize)
	}

	// Check for dangerous keys (Prototype Pollution)
	jsonStr := string(jsonBytes)
	for _, key := range dangerousKeys {
		if strings.Contains(jsonStr, key) {
			return fmt.Errorf("input contains forbidden key: %s", key)
		}
	}

	// Check nesting depth
	if depth := getObjectDepth(inputMap, 1); depth > maxNestDepth {
		return fmt.Errorf("input nesting exceeds maximum depth (%d)", maxNestDepth)
	}

	return nil
}

func getObjectDepth(obj any, currentDepth int) int {
	if currentDepth > maxNestDepth {
		return currentDepth
	}

	switch v := obj.(type) {
	case map[string]any:
		maxDepth := currentDepth
		for _, val := range v {
			depth := getObjectDepth(val, currentDepth+1)
			if depth > maxDepth {
				maxDepth = depth
			}
		}
		return maxDepth
	case []any:
		maxDepth := currentDepth
		for _, val := range v {
			depth := getObjectDepth(val, currentDepth+1)
			if depth > maxDepth {
				maxDepth = depth
			}
		}
		return maxDepth
	default:
		return currentDepth
	}
}
