package validator

import (
	"strconv"
	"strings"
	"testing"
)

// generateDeepNestedObject は指定した深度のネストオブジェクトを生成する
func generateDeepNestedObject(depth int) map[string]any {
	if depth <= 0 {
		return map[string]any{"value": "leaf"}
	}
	return map[string]any{"nested": generateDeepNestedObject(depth - 1)}
}

// generateLargeObject は指定したサイズに近いJSONオブジェクトを生成する
func generateLargeObject(targetSizeBytes int) map[string]any {
	obj := make(map[string]any)
	estimatedKeys := targetSizeBytes / 20
	for i := range estimatedKeys {
		key := "key_" + strconv.Itoa(i)
		obj[key] = "value"
	}
	return obj
}

func TestValidateName(t *testing.T) {
	tests := []struct {
		name      string
		inputName string
		field     string
		maxLength int
		wantErr   bool
		errMsg    string
	}{
		// 正常系
		{
			name:      "valid name with hyphen",
			inputName: "valid-name",
			field:     "server",
			maxLength: 50,
			wantErr:   false,
		},
		{
			name:      "valid name with underscore",
			inputName: "valid_name",
			field:     "toolName",
			maxLength: 100,
			wantErr:   false,
		},
		{
			name:      "valid name with mixed alphanumeric",
			inputName: "ValidName123",
			field:     "server",
			maxLength: 50,
			wantErr:   false,
		},
		{
			name:      "single character name",
			inputName: "a",
			field:     "server",
			maxLength: 50,
			wantErr:   false,
		},
		{
			name:      "server name at max length (50)",
			inputName: strings.Repeat("a", 50),
			field:     "server",
			maxLength: 50,
			wantErr:   false,
		},
		{
			name:      "toolName at max length (100)",
			inputName: strings.Repeat("a", 100),
			field:     "toolName",
			maxLength: 100,
			wantErr:   false,
		},

		// エラー系
		{
			name:      "empty name",
			inputName: "",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "is required",
		},
		{
			name:      "server name exceeds max length (51)",
			inputName: strings.Repeat("a", 51),
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "exceeds maximum length",
		},
		{
			name:      "toolName exceeds max length (101)",
			inputName: strings.Repeat("a", 101),
			field:     "toolName",
			maxLength: 100,
			wantErr:   true,
			errMsg:    "exceeds maximum length",
		},
		{
			name:      "name with space",
			inputName: "invalid name",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "name with dot",
			inputName: "invalid.name",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "name with @ symbol",
			inputName: "invalid@name",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},

		// セキュリティ
		{
			name:      "path traversal attempt",
			inputName: "../../../etc/passwd",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "command injection attempt",
			inputName: "name; rm -rf /",
			field:     "toolName",
			maxLength: 100,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "XSS attempt",
			inputName: "<script>alert('xss')</script>",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "null byte injection",
			inputName: "name\x00null",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "newline injection",
			inputName: "name\nwith\nnewline",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
		{
			name:      "tab injection",
			inputName: "name\twith\ttab",
			field:     "server",
			maxLength: 50,
			wantErr:   true,
			errMsg:    "contains invalid characters",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateName(tt.inputName, tt.field, tt.maxLength)

			if tt.wantErr {
				if err == nil {
					t.Errorf("validateName() expected error but got nil")
				} else if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("validateName() error = %v, want error containing %q", err, tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("validateName() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestGetObjectDepth(t *testing.T) {
	tests := []struct {
		name         string
		obj          any
		currentDepth int
		want         int
	}{
		// 正常系 - プリミティブ値
		{
			name:         "primitive string",
			obj:          "string",
			currentDepth: 0,
			want:         0,
		},
		{
			name:         "primitive number",
			obj:          123,
			currentDepth: 0,
			want:         0,
		},
		{
			name:         "primitive boolean",
			obj:          true,
			currentDepth: 0,
			want:         0,
		},

		// 正常系 - オブジェクト
		{
			name:         "one-level object",
			obj:          map[string]any{"key": "value"},
			currentDepth: 1,
			want:         2,
		},
		{
			name:         "two-level nesting",
			obj:          map[string]any{"a": map[string]any{"b": "value"}},
			currentDepth: 1,
			want:         3,
		},
		{
			name:         "depth 10 (boundary)",
			obj:          generateDeepNestedObject(10),
			currentDepth: 1,
			want:         11,
		},

		// 正常系 - 配列
		{
			name:         "primitive array",
			obj:          []any{1, 2, 3},
			currentDepth: 1,
			want:         2,
		},
		{
			name:         "array with object",
			obj:          []any{map[string]any{"key": "value"}},
			currentDepth: 1,
			want:         3,
		},
		{
			name:         "object with multiple keys",
			obj:          map[string]any{"a": 1, "b": 2, "c": 3},
			currentDepth: 1,
			want:         2,
		},

		// エッジケース
		{
			name:         "depth 11 (over max)",
			obj:          generateDeepNestedObject(11),
			currentDepth: 1,
			want:         11,
		},
		{
			name:         "empty object",
			obj:          map[string]any{},
			currentDepth: 1,
			want:         1,
		},
		{
			name:         "empty array",
			obj:          []any{},
			currentDepth: 1,
			want:         1,
		},
		{
			name:         "currentDepth exceeds maxNestDepth",
			obj:          "value",
			currentDepth: 11,
			want:         11,
		},
		{
			name: "mixed nesting map-array-map",
			obj: map[string]any{
				"level1": []any{
					map[string]any{"level2": "value"},
				},
			},
			currentDepth: 1,
			want:         4,
		},
		{
			name: "multiple branches with different depths",
			obj: map[string]any{
				"branch1": "value",
				"branch2": map[string]any{
					"branch2_1": map[string]any{
						"branch2_1_1": "value",
					},
				},
			},
			currentDepth: 1,
			want:         4,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getObjectDepth(tt.obj, tt.currentDepth)
			if got != tt.want {
				t.Errorf("getObjectDepth() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateInput(t *testing.T) {
	tests := []struct {
		name    string
		input   any
		wantErr bool
		errMsg  string
	}{
		// 正常系
		{
			name:    "simple object",
			input:   map[string]any{"key": "value"},
			wantErr: false,
		},
		{
			name:    "mixed types",
			input:   map[string]any{"a": 1, "b": "text", "c": true},
			wantErr: false,
		},
		{
			name:    "object with array",
			input:   map[string]any{"array": []any{1, 2, 3}},
			wantErr: false,
		},
		{
			name:    "empty object",
			input:   map[string]any{},
			wantErr: false,
		},
		{
			name:    "nesting depth 8 (safe)",
			input:   generateDeepNestedObject(8),
			wantErr: false,
		},
		{
			name:    "size 99KB (safe)",
			input:   generateLargeObject(99 * 1024),
			wantErr: false,
		},

		// エラー系 - 型エラー
		{
			name:    "non-object string",
			input:   "string",
			wantErr: true,
			errMsg:  "must be a JSON object",
		},
		{
			name:    "non-object number",
			input:   123,
			wantErr: true,
			errMsg:  "must be a JSON object",
		},
		{
			name:    "non-object array",
			input:   []any{1, 2, 3},
			wantErr: true,
			errMsg:  "must be a JSON object",
		},
		{
			name:    "non-object nil",
			input:   nil,
			wantErr: true,
			errMsg:  "must be a JSON object",
		},

		// エラー系 - ネスト深度
		{
			name:    "nesting depth 11 (over)",
			input:   generateDeepNestedObject(11),
			wantErr: true,
			errMsg:  "exceeds maximum depth",
		},
		{
			name:    "nesting depth 15 (far over)",
			input:   generateDeepNestedObject(15),
			wantErr: true,
			errMsg:  "exceeds maximum depth",
		},

		// エラー系 - サイズ制限
		{
			name: "size slightly over 100KB",
			input: func() map[string]any {
				// 正確に100KBを超えるオブジェクトを生成
				obj := make(map[string]any)
				// あらかじめテストして、実際に100KBを超えることを確認
				for i := 0; i < 6000; i++ {
					obj["key_"+strconv.Itoa(i)] = "value"
				}
				return obj
			}(),
			wantErr: true,
			errMsg:  "exceeds maximum size",
		},
		{
			name:    "size 200KB (far over)",
			input:   generateLargeObject(200 * 1024),
			wantErr: true,
			errMsg:  "exceeds maximum size",
		},

		// セキュリティ - Prototype Pollution
		{
			name: "prototype pollution - __proto__",
			input: map[string]any{
				"__proto__": map[string]any{"isAdmin": true},
			},
			wantErr: true,
			errMsg:  "contains forbidden key: __proto__",
		},
		{
			name: "prototype pollution - nested __proto__",
			input: map[string]any{
				"user": map[string]any{
					"profile": map[string]any{
						"__proto__": map[string]any{"role": "admin"},
					},
				},
			},
			wantErr: true,
			errMsg:  "contains forbidden key: __proto__",
		},
		{
			name: "prototype pollution - constructor",
			input: map[string]any{
				"constructor": map[string]any{"prototype": map[string]any{"polluted": true}},
			},
			wantErr: true,
			errMsg:  "contains forbidden key: constructor",
		},
		{
			name: "prototype pollution - prototype",
			input: map[string]any{
				"prototype": "value",
			},
			wantErr: true,
			errMsg:  "contains forbidden key: prototype",
		},

		// エッジケース
		{
			name: "array-based deep nesting (depth 11)",
			input: map[string]any{
				"data": []any{
					map[string]any{
						"nested": []any{
							map[string]any{
								"deep": []any{
									map[string]any{
										"deeper": []any{
											map[string]any{
												"deepest": []any{
													map[string]any{
														"toodeep": []any{
															map[string]any{
																"toolevel": "value",
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			wantErr: true,
			errMsg:  "exceeds maximum depth",
		},
		{
			name: "mixed nesting map-array-map",
			input: map[string]any{
				"level1": []any{
					map[string]any{
						"level2": []any{
							map[string]any{"level3": "value"},
						},
					},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateInput(tt.input)

			if tt.wantErr {
				if err == nil {
					t.Errorf("validateInput() expected error but got nil")
				} else if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("validateInput() error = %v, want error containing %q", err, tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("validateInput() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestValidateRequest(t *testing.T) {
	tests := []struct {
		name     string
		server   string
		toolName string
		input    any
		wantErr  bool
		errMsg   string
	}{
		// 正常系
		{
			name:     "all valid",
			server:   "valid-server",
			toolName: "valid-tool",
			input:    map[string]any{"key": "value"},
			wantErr:  false,
		},
		{
			name:     "complex valid names",
			server:   "server_123",
			toolName: "tool-name_v2",
			input:    map[string]any{"data": 123},
			wantErr:  false,
		},

		// エラー系 - 必須フィールド
		{
			name:     "empty server",
			server:   "",
			toolName: "valid-tool",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "is required",
		},
		{
			name:     "empty toolName",
			server:   "valid-server",
			toolName: "",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "is required",
		},

		// エラー系 - input型エラー
		{
			name:     "non-object input",
			server:   "valid-server",
			toolName: "valid-tool",
			input:    "string",
			wantErr:  true,
			errMsg:   "must be a JSON object",
		},

		// エラー系 - 無効な文字
		{
			name:     "invalid server name",
			server:   "invalid server",
			toolName: "valid-tool",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "contains invalid characters",
		},
		{
			name:     "invalid toolName",
			server:   "valid-server",
			toolName: "invalid tool",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "contains invalid characters",
		},

		// エラー系 - 長さ制限
		{
			name:     "server exceeds max length",
			server:   strings.Repeat("a", 51),
			toolName: "valid-tool",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "exceeds maximum length",
		},
		{
			name:     "toolName exceeds max length",
			server:   "valid-server",
			toolName: strings.Repeat("a", 101),
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "exceeds maximum length",
		},

		// エラー系 - input深度
		{
			name:     "input depth exceeds max",
			server:   "valid-server",
			toolName: "valid-tool",
			input:    generateDeepNestedObject(11),
			wantErr:  true,
			errMsg:   "exceeds maximum depth",
		},

		// セキュリティ
		{
			name:     "server path traversal",
			server:   "../etc/passwd",
			toolName: "valid-tool",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "contains invalid characters",
		},
		{
			name:     "toolName command injection",
			server:   "valid-server",
			toolName: "tool; rm -rf /",
			input:    map[string]any{"key": "value"},
			wantErr:  true,
			errMsg:   "contains invalid characters",
		},
		{
			name:     "input prototype pollution",
			server:   "valid-server",
			toolName: "valid-tool",
			input:    map[string]any{"__proto__": map[string]any{"isAdmin": true}},
			wantErr:  true,
			errMsg:   "contains forbidden key",
		},

		// 境界値
		{
			name:     "all boundary values",
			server:   strings.Repeat("a", 50),
			toolName: strings.Repeat("b", 100),
			input:    generateLargeObject(99 * 1024),
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRequest(tt.server, tt.toolName, tt.input)

			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateRequest() expected error but got nil")
				} else if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("ValidateRequest() error = %v, want error containing %q", err, tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateRequest() unexpected error = %v", err)
				}
			}
		})
	}
}
