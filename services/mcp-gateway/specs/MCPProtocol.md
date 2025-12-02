# MCP Protocol 実装仕様

## 概要

MCP Gateway は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-11-25) に準拠した実装を提供します。

**サポート Transport**:

- ✅ **STDIO Transport**（初期実装）
- ⏳ **StreamableHTTP Transport**（将来実装）
- ⏳ **SSE Transport**（将来実装）

**公式仕様**: https://modelcontextprotocol.io/specification/2025-11-25

---

## MCP Protocol 概要

### JSON-RPC 2.0 メッセージ形式

MCP は JSON-RPC 2.0 をベースとしたメッセージング形式を使用します。

**リクエスト例**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "calculate-bmi",
    "arguments": {
      "weight_kg": 70,
      "height_m": 1.75
    }
  }
}
```

**レスポンス例**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"bmi\": 22.86, \"category\": \"normal\"}"
      }
    ]
  }
}
```

**エラーレスポンス例**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "reason": "weight_kg must be positive"
    }
  }
}
```

### JSON-RPC 2.0 エラーコード

| コード | 説明             | MCP での用途         |
| ------ | ---------------- | -------------------- |
| -32700 | Parse error      | JSON パースエラー    |
| -32600 | Invalid Request  | リクエスト形式エラー |
| -32601 | Method not found | 未サポートのメソッド |
| -32602 | Invalid params   | パラメータエラー     |
| -32603 | Internal error   | Server 内部エラー    |

---

## STDIO Transport 実装

### MCP Go SDK の使用

MCP Gateway は MCP [Go SDK](https://github.com/modelcontextprotocol/go-sdk) を使用して MCP Server と通信します。SDK は高レベルの Client インターフェースを提供し、低レベルの JSON-RPC 通信を抽象化します。

**実装例**:

```go
import (
	"context"
	"fmt"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ServerConfig struct {
	Name    string
	Command string
	Args    []string
	Envs    map[string]string
	Timeout int
}

func createMCPClient(ctx context.Context, config ServerConfig) (*mcp.Client, error) {
	// 環境変数の準備
	env := []string{}

	// ユーザー定義環境変数をマージ
	for k, v := range config.Envs {
		env = env.append(fmt.Sprintf("%v=%v", k, v))
	}

	// Transport の作成
	command := exec.Command{[]string{config.Command, config.Args...}}
	command.Env = append(os.Environ(), env)

	transport := &mcp.CommandTransport{
		Command: command
	}

	// Client の作成
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "mcp-gateway",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, transport)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MCP server '%s': %w", config.Name, err)
	}
	// session は必ず Close() すること

	fmt.Printf("[INFO] MCP Client connected to '%s'\n", config.Name)

	return client, nil
}
```

**起動フロー**:

1. config.yaml を読み込み
2. 各 MCP Server に対して Client インスタンスを作成
3. `client.connect(transport)` で接続（Capability Negotiation を自動実行）
4. `client.listTools()` で Tools List を取得してキャッシュ

**SDK のメリット**:

- 低レベルの JSON-RPC 通信を抽象化
- Capability Negotiation を自動処理
- プロセス起動・停止を Transport が管理
- エラーハンドリングが簡潔

---

### stdin/stdout 通信プロトコル

**注意**: MCP Go SDK を使用する場合、stdin/stdout 通信は Transport が自動的に処理します。以下は SDK 内部で行われる処理の説明です。

**送信** (Gateway → MCP Server):

SDK の `client.callTool()` などのメソッドを呼び出すと、内部で以下が実行されます：

1. JSON-RPC メッセージを JSON 文字列にシリアライズ
2. 末尾に `\n` を追加
3. Transport が stdin に書き込み

**受信** (MCP Server → Gateway):

Transport が以下を自動的に処理します：

1. stdout から1行読み取り
2. JSON パース
3. JSON-RPC 2.0 形式チェック
4. `id` でリクエストとマッピング
5. Client にレスポンスを返却

**SDK を使用した通信例**:

```go
// Tools List 取得
for tool, err := range session.Tools(ctx, nil) {
	if err != nil {
		// エラーハンドリング
		break
	}
	// tool を処理
}

// Tools Call 実行
result, err := session.CallTool(
	ctx, &mcp.CallToolParams{
		Name: "calculate-bmi",
		Arguments: map[string]any{
			"weight_kg": 70,
			"height_m":  1.75,
		},
	},
)
if err != nil {
	// エラーハンドリング
}
```

SDK がすべての低レベル通信を処理するため、開発者は高レベル API のみを意識すれば良い。

---

### プロセス管理

#### 起動フロー

```
1. config.yaml を読み込み
   ↓
2. 各 MCP Server のプロセスを起動
   ↓
3. Capability Negotiation
   ↓
4. tools/list リクエストを送信
   ↓
5. Tools List をキャッシュ
   ↓
6. 準備完了（リクエスト受付開始）
```

**Capability Negotiation（初期化）**:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "mcp-gateway",
      "version": "1.0.0"
    }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "weather-server",
      "version": "1.0.0"
    }
  }
}
```

---

#### クラッシュ検知

MCP Go SDK の Transport は内部でプロセス監視を行います。クラッシュ検知は以下のように実装できます：

```go
import (
	"context"
	"log/slog"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func monitorTransport(
	ctx context.Context,
	session *mcp.ClientSession,
	serverName string,
	processManager *ProcessManager,
) {
	// Session が接続中の間は available
	processManager.SetStatus(serverName, "available")

	// Session の終了を監視
	// Wait() はセッションが終了するまでブロック
	session.Wait()

	// Session が終了した場合
	slog.Error("MCP Client disconnected", "server", serverName)
	processManager.SetStatus(serverName, "unavailable")
}
```

**クラッシュ時の動作**:

1. Transport がプロセスクラッシュを検知
2. Process Manager のステータスを `"unavailable"` に更新
3. 次のリクエストで `SERVER_NOT_RUNNING` または `SERVER_CRASHED` エラーを返却
4. 再起動**しない**（手動再起動が必要）

---

#### 停止フロー

MCP Go SDK を使用する場合、停止処理は Session の `Close()` メソッドで行います：

**実装例**:

```go
import (
	"log/slog"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func stopMCPClient(
	session *mcp.ClientSession,
	serverName string,
) error {
	slog.Info("Stopping MCP Client", "server", serverName)

	// Session を切断（Transport が内部でプロセスを終了）
	if err := session.Close(); err != nil {
		slog.Error("Failed to stop MCP Client", "server", serverName, "error", err)
		return err
	}

	slog.Info("MCP Client stopped", "server", serverName)
	return nil
}
```

**停止フロー**:

1. `client.close()` を呼び出し
2. Transport が内部で以下を実行:
   - 実行中のリクエストを待機（タイムアウト付き）
   - プロセスに SIGTERM を送信
   - 一定時間待機後、SIGKILL を送信（必要に応じて）
3. プロセス終了

---

## Tools List / Tools Call フロー

### Tools List 取得

**MCP Gateway 起動時**:

1. 各 MCP Server に `tools/list` リクエストを送信
2. レスポンスをキャッシュ
3. `GET /mcp/tools` で返却

**JSON-RPC リクエスト**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**JSON-RPC レスポンス**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "calculate-bmi",
        "description": "Calculate Body Mass Index",
        "inputSchema": {
          "type": "object",
          "properties": {
            "weight_kg": {
              "type": "number",
              "description": "Weight in kilograms"
            },
            "height_m": {
              "type": "number",
              "description": "Height in meters"
            }
          },
          "required": ["weight_kg", "height_m"]
        }
      }
    ]
  }
}
```

**キャッシュ構造**:

```go
type ToolInfo struct {
	Timeout      int                    `json:"timeout"`             // Tool に設定されたタイムアウト（ミリ秒）
	Name         string                 `json:"name"`                // Tool 名
	Description  string                 `json:"description"`         // Tool の説明
	Server       string                 `json:"server"`              // どの MCP Server が提供しているか
	InputSchema  map[string]any         `json:"inputSchema"`         // Tool の入力スキーマ（JSON Schema）
	OutputSchema map[string]any         `json:"outputSchema"`        // Tool の出力スキーマ（JSON Schema）- MCP Server が提供
}

// キャッシュ
var toolsCache = make(map[string]ToolInfo)
var toolsCacheMutex sync.RWMutex

// 例
toolsCacheMutex.Lock()
toolsCache["calculate-bmi"] = ToolInfo{
	Timeout:      30000,
	Name:         "calculate-bmi",
	Description:  "Calculate Body Mass Index",
	Server:       "health-server",
	InputSchema:  map[string]any{ /* ... */ },
	OutputSchema: map[string]any{ /* ... */ },
}
toolsCacheMutex.Unlock()
```

---

### Tools Call 実行

**`POST /mcp/call` リクエスト受信時**:

1. `server` と `toolName` をバリデーション
2. 該当する MCP Client を取得
3. `client.callTool()` を実行
4. レスポンスを待機（タイムアウト付き）
5. 結果を HTTP レスポンスとして返却

**JSON-RPC リクエスト**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "calculate-bmi",
    "arguments": {
      "weight_kg": 70,
      "height_m": 1.75
    }
  }
}
```

**JSON-RPC レスポンス**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"bmi\": 22.86, \"category\": \"normal\"}"
      }
    ]
  }
}
```

**MCP Gateway の HTTP レスポンス**:

```json
{
  "success": true,
  "result": {
    "bmi": 22.86,
    "category": "normal"
  }
}
```

**実装例**:

```go
func callTool(
	ctx context.Context,
	server string,
	toolName string,
	input map[string]any,
	sessions map[string]*mcp.ClientSession,
	processManager *ProcessManager,
) (*mcp.CallToolResult, error) {
	// 1. MCP Session を取得
	session, ok := sessions[server]
	if !ok {
		return nil, fmt.Errorf("server '%s' not found", server)
	}

	// 2. Server の状態を確認
	status := processManager.GetStatus(server)
	if status != "available" {
		return nil, fmt.Errorf("server '%s' is %s", server, status)
	}

	// 3. SDK を使って Tool を呼び出し（タイムアウト付き）
	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: input,
	})
	if err != nil {
		// SDK が JSON-RPC エラーを返す
		return nil, fmt.Errorf("tool execution error: %w", err)
	}

	return result, nil
}
```

---

## エラーマッピング

### MCP エラーコード → HTTP ステータスコード

| JSON-RPC エラーコード | MCP エラータイプ | HTTPステータス | MCP Gateway エラーコード |
| --------------------- | ---------------- | -------------- | ------------------------ |
| -32700                | Parse error      | 500            | `INTERNAL_ERROR`         |
| -32600                | Invalid Request  | 400            | `VALIDATION_ERROR`       |
| -32601                | Method not found | 404            | `TOOL_NOT_FOUND`         |
| -32602                | Invalid params   | 400            | `VALIDATION_ERROR`       |
| -32603                | Internal error   | 500            | `TOOL_EXECUTION_ERROR`   |
| (その他)              | Custom error     | 500            | `TOOL_EXECUTION_ERROR`   |

**マッピング実装例**:

```go
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    any `json:"data,omitempty"`
}

type HTTPError struct {
	Status  int         `json:"-"`
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details any `json:"details,omitempty"`
}

func mapJSONRPCErrorToHTTP(jsonrpcError JSONRPCError) HTTPError {
	switch jsonrpcError.Code {
	case -32700: // Parse error
		return HTTPError{
			Status:  500,
			Code:    "INTERNAL_ERROR",
			Message: "Internal error: Failed to parse MCP Server response",
		}

	case -32600: // Invalid Request
		return HTTPError{
			Status:  400,
			Code:    "VALIDATION_ERROR",
			Message: "Invalid request format",
		}

	case -32601: // Method not found
		return HTTPError{
			Status:  404,
			Code:    "TOOL_NOT_FOUND",
			Message: jsonrpcError.Message,
		}

	case -32602: // Invalid params
		return HTTPError{
			Status:  400,
			Code:    "VALIDATION_ERROR",
			Message: jsonrpcError.Message,
		}

	case -32603: // Internal error
		return HTTPError{
			Status:  500,
			Code:    "TOOL_EXECUTION_ERROR",
			Message: jsonrpcError.Message,
		}

	default: // Custom error
		return HTTPError{
			Status:  500,
			Code:    "TOOL_EXECUTION_ERROR",
			Message: jsonrpcError.Message,
		}
	}
}
```

**エラー変換例**:

```json
// MCP Server からの JSON-RPC エラー
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params: weight_kg must be positive",
    "data": {
      "field": "weight_kg"
    }
  }
}

// MCP Gateway の HTTP レスポンス
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid params: weight_kg must be positive",
    "details": {
      "jsonrpcCode": -32602,
      "field": "weight_kg"
    }
  }
}
```

---

## タイムアウト管理

### Tools Call のタイムアウト設定

**タイムアウト値の決定順序**:

1. config.yaml の `servers[].timeout`
2. 環境変数 `DEFAULT_TIMEOUT` (デフォルト: 30秒)

**タイムアウト時の動作**:

1. タイムアウトを検知
2. `TimeoutError` を throw
3. HTTP レスポンスで `TIMEOUT_ERROR` (504) を返却
4. MCP Server プロセスは維持（次のリクエストに備える）

**注意事項**:

- JSON-RPC Cancel Request は MCP 仕様ではオプション
- 初期実装では Cancel Request を送信しない
- Tool 実行が完了するまで MCP Server 側で処理が続く可能性がある

---

## StreamableHTTP / SSE Transport（将来実装）

### 概要

現在は STDIO Transport のみサポートしていますが、将来的に以下の Transport をサポート予定：

**StreamableHTTP Transport**:

- HTTP POST を使用した双方向通信
- レスポンスストリーミング
- 複数リクエストの並列処理

**SSE Transport (Server-Sent Events)**:

- HTTP GET でストリーム接続
- Server → Client の一方向通信
- リアルタイム通知

### config.yaml での設定（将来）

```yaml
servers:
  # STDIO Transport（現在サポート）
  - name: local-server
    command: /usr/local/bin/mcp-server

  # StreamableHTTP Transport（将来実装）
  - name: remote-http-server
    url: http://example.com/mcp
    timeout: 60000

  # SSE Transport（将来実装）
  - name: remote-sse-server
    url: http://example.com/mcp/events
    timeout: 60000
```

### Transport 自動選択（将来）

将来実装予定のイメージ

```go
func connectToServer(ctx context.Context, config ServerConfig) (*mcp.ClientSession, error) {
	if config.Command != "" {
		// STDIO Transport
		return createSTDIOClient(ctx, config)
	} else if config.URL != "" {
		// StreamableHTTP Transport を試行
		session, err := createStreamableHTTPClient(ctx, config.URL)
		if err != nil {
			// 4xx エラーの場合は SSE Transport にフォールバック
			var httpErr *HTTPError
			if errors.As(err, &httpErr) && httpErr.Status >= 400 && httpErr.Status < 500 {
				return createSSEClient(ctx, config.URL)
			}
			return nil, err
		}
		return session, nil
	} else {
		return nil, errors.New("either command or url must be specified")
	}
}
```

---

## MCP Go SDK の使用

### SDK のインストール

```bash
go get github.com/modelcontextprotocol/go-sdk@latest
```

### SDK を使用した実装例

```go
import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func createMCPClient(ctx context.Context, config ServerConfig) (*mcp.ClientSession, error) {
	// 環境変数の準備
	env := []string{}
	for k, v := range config.Envs {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	// Command の作成
	command := exec.CommandContext(ctx, config.Command, config.Args...)
	command.Env = append(os.Environ(), env...)

	// Transport の作成
	transport := &mcp.CommandTransport{
		Command: command,
	}

	// Client の作成
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "mcp-gateway",
		Version: "1.0.0",
	}, nil)

	// 接続（Capability Negotiation を自動実行）
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MCP server: %w", err)
	}

	return session, nil
}

// Tools List 取得
func getTools(ctx context.Context, session *mcp.ClientSession) ([]mcp.Tool, error) {
	var tools []mcp.Tool
	for tool, err := range session.Tools(ctx, nil) {
		if err != nil {
			return nil, err
		}
		tools = append(tools, tool)
	}
	return tools, nil
}

// Tools Call 実行
func executeTool(ctx context.Context, session *mcp.ClientSession) (*mcp.CallToolResult, error) {
	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name: "calculate-bmi",
		Arguments: map[string]any{
			"weight_kg": 70,
			"height_m":  1.75,
		},
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
```

**SDK を使用するメリット**:

- JSON-RPC 2.0 メッセージングの抽象化
- Transport の実装が提供される
- 型安全性の向上
- MCP 仕様の変更への対応が容易

---

## 関連ドキュメント

- [API.md](API.md) - HTTP エンドポイント仕様
- [SystemArchitecture.md](SystemArchitecture.md) - Process Manager コンポーネント
- [Security.md](Security.md) - プロセス分離とセキュリティ
- [Configuration.md](Configuration.md) - config.yaml の詳細仕様
- [Sequence.md](Sequence.md) - Tools Call フロー図
- [MCP 公式仕様](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Go SDK ドキュメント](https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk@v1.1.0/mcp)