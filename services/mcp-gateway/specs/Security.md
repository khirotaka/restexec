# セキュリティ考慮事項

## 入力バリデーション

### server と toolName のバリデーション

**検証内容**:

- `server`: 必須、空文字列不可、英数字とハイフン・アンダースコアのみ (`/^[a-zA-Z0-9-_]+$/`)、最大長50文字
- `toolName`: 必須、空文字列不可、英数字とハイフン・アンダースコアのみ (`/^[a-zA-Z0-9-_]+$/`)、最大長100文字

**リスク**: インジェクション攻撃、パストラバーサル

**対策実装例**:

```go
import (
	"errors"
	"regexp"
)

var (
	serverNamePattern = regexp.MustCompile(`^[a-zA-Z0-9-_]+$`)
	toolNamePattern   = regexp.MustCompile(`^[a-zA-Z0-9-_]+$`)
)

func validateServerName(server string) error {
	if server == "" {
		return errors.New("server is required")
	}

	if !serverNamePattern.MatchString(server) {
		return errors.New("server contains invalid characters")
	}

	if len(server) > 50 {
		return errors.New("server exceeds maximum length (50 characters)")
	}

	return nil
}

func validateToolName(toolName string) error {
	if toolName == "" {
		return errors.New("toolName is required")
	}

	if !toolNamePattern.MatchString(toolName) {
		return errors.New("toolName contains invalid characters")
	}

	if len(toolName) > 100 {
		return errors.New("toolName exceeds maximum length (100 characters)")
	}

	return nil
}
```

**禁止される例**:

- `../../../etc/passwd` (パストラバーサル)
- `tool; rm -rf /` (コマンドインジェクション)
- `tool@server` (不正な文字)
- `<script>alert('xss')</script>` (XSS試行)

---

### input のサニタイズ

**検証内容**:

- オブジェクト型チェック
- 最大サイズチェック（100KB）
- ネストの深さチェック（最大10階層）
- 禁止文字列チェック（`__proto__`, `constructor`, `prototype`）

**リスク**: Prototype Pollution、DoS攻撃

**対策実装例**:

```go
import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	maxInputSize  = 100 * 1024 // 100KB
	maxNestDepth  = 10
)

var dangerousKeys = []string{"__proto__", "constructor", "prototype"}

func findDangerousKey(v any) string {
    switch val := v.(type) {
    case map[string]any:
        for k, sub := range val {
            for _, dk := range dangerousKeys {
                if k == dk {
                    return dk
                }
            }
            if found := findDangerousKey(sub); found != "" {
                return found
            }
        }
    case []any:
        for _, item := range val {
            if found := findDangerousKey(item); found != "" {
                return found
            }
        }
    }
    return ""
}

func validateInput(input any) (map[string]any, error) {
	// 型チェック
	inputMap, ok := input.(map[string]any)
	if !ok {
		return nil, errors.New("input must be a plain object")
	}

	// サイズチェック
	jsonBytes, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input: %w", err)
	}
	if len(jsonBytes) > maxInputSize {
		return nil, fmt.Errorf("input exceeds maximum size (%d bytes)", maxInputSize)
	}

	// Prototype Pollution 対策
	if found := findDangerousKey(input); found != "" {
		return nil, fmt.Errorf("input contains forbidden key: %s", found)
	}

	// ネスト深さチェック
	depth := getObjectDepth(input, 0)
	if depth > maxNestDepth {
		return nil, fmt.Errorf("input nesting exceeds maximum depth (%d)", maxNestDepth)
	}

	return inputMap, nil
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
```

**禁止される例**:

```json
// Prototype Pollution 試行
{
  "__proto__": {
    "isAdmin": true
  }
}

// 過度に深いネスト（11階層）
{
  "a": {
    "b": {
      "c": {
        "d": {
          "e": {
            "f": {
              "g": {
                "h": {
                  "i": {
                    "j": {
                      "k": "value"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 出力サニタイズ

### MCP Server レスポンスの検証

**検証内容**:

- JSON-RPC 2.0 形式チェック
- result フィールドの存在確認
- 最大サイズチェック（1MB）

**リスク**: レスポンスインジェクション、DoS攻撃

**対策実装例**:

```go
import (
	"encoding/json"
	"errors"
	"fmt"
)

const maxResultSize = 1024 * 1024 // 1MB

func sanitizeToolResult(rawResult any) (any, error) {
	// 型チェック（基本的な検証）
	if rawResult == nil {
		return nil, errors.New("tool result is nil")
	}

	// サイズチェック
	jsonBytes, err := json.Marshal(rawResult)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal tool result: %w", err)
	}

	if len(jsonBytes) > maxResultSize {
		return nil, fmt.Errorf("tool result exceeds maximum size (%d bytes)", maxResultSize)
	}

	return rawResult, nil
}
```

**考慮事項**:

- MCP Server からの出力は信頼できるとみなす（内部ネットワーク前提）
- ただし、サイズ制限は必須（DoS対策）
- XSS対策はフロントエンド側で実施（MCP Gateway は API サーバーのため）

---

## プロセス分離

### MCP Server プロセスの独立実行

各 MCP Server は独立した子プロセスとして実行されます：

**分離要素**:

- **プロセス空間**: 各 Server は別プロセスで動作
- **環境変数**: config.yaml で指定された環境変数のみを渡す
- **stdin/stdout**: 各プロセスは独自の stdin/stdout を持つ
- **障害の分離**: 一つの Server がクラッシュしても他の Server に影響しない

**環境変数の安全な渡し方**:

```go
import (
	"fmt"
	"os"
	"os/exec"
)

func createProcess(command string, args []string, serverEnv map[string]string) *exec.Cmd {
	cmd := exec.Command(command, args...)

	// システム環境変数（最小限）
	env := []string{
		fmt.Sprintf("PATH=%s", getEnvOrDefault("PATH", "/usr/local/bin:/usr/bin:/bin")),

	}

	// ユーザー定義環境変数（config.yaml から）
	for k, v := range serverEnv {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	cmd.Env = env
	return cmd
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

**禁止される環境変数**:

- ホストの `HOME`, `USER`, `PWD` などのシステム変数
- 親プロセスの全環境変数を無差別に継承すること

---

## リソース制限

### タイムアウト設定

| 項目                   | デフォルト値 | 最大値 | 説明                          |
| ---------------------- | ------------ | ------ | ----------------------------- |
| Tool Call Timeout      | 30秒         | 300秒  | Tool 呼び出しのタイムアウト   |
| Server Startup Timeout | 10秒         | -      | MCP Server 起動のタイムアウト |

**タイムアウト時の動作**:

1. Tool 呼び出しをキャンセル
2. ユーザーに `TIMEOUT_ERROR` を返却
3. MCP Server プロセスは維持（次のリクエストに備える）

**実装例**:

```go
import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrTimeout = errors.New("timeout")

func callToolWithTimeout(
	ctx context.Context,
	toolName string,
	input map[string]any,
	timeout time.Duration,
) (any, error) {
	// タイムアウト付きのコンテキストを作成
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 結果を受け取るチャネル
	type result struct {
		data any
		err  error
	}
	resultCh := make(chan result, 1)

	// Tool 呼び出しを別 goroutine で実行
	go func() {
		data, err := sendToolCallRequest(ctx, toolName, input)
		resultCh <- result{data: data, err: err}
	}()

	// タイムアウトまたは結果を待機
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("tool execution timed out after %v: %w", timeout, ErrTimeout)
	case res := <-resultCh:
		if res.err != nil {
			return nil, res.err
		}
		return res.data, nil
	}
}
```

---

### バッファサイズ制限

| 項目                   | 最大サイズ | 説明                        |
| ---------------------- | ---------- | --------------------------- |
| リクエストボディ       | 1MB        | POST /mcp/call の全体サイズ |
| input パラメータ       | 100KB      | Tool の入力パラメータサイズ |
| レスポンスボディ       | 1MB        | Tool の実行結果サイズ       |
| stdout/stderr バッファ | 10MB       | MCP Server の出力バッファ   |

**オーバーフロー時の動作**:

- リクエストボディ超過 → `VALIDATION_ERROR` (400)
- レスポンスボディ超過 → `TOOL_EXECUTION_ERROR` (500)
- stdout/stderr バッファ超過 → プロセスを強制終了

---

## エラーハンドリング戦略

### MCP Server クラッシュ時

**動作**:

1. プロセスクラッシュを検知（exit code ≠ 0）
2. プロセスステータスを `"crashed"` に更新
3. ユーザーに `SERVER_CRASHED` エラーを返却
4. 再接続**しない**（手動再起動が必要）

**理由**:

- 自動再接続は無限ループを引き起こす可能性
- クラッシュの原因調査を優先
- Server のバグの可能性が高い

**エラーレスポンス**:

```json
{
  "success": false,
  "error": {
    "code": "SERVER_CRASHED",
    "message": "MCP Server 'weather-server' has crashed",
    "details": {
      "server": "weather-server",
      "exitCode": 1
    }
  }
}
```

**実装例**:

```go
import (
	"log/slog"
	"os/exec"
)

func monitorProcess(cmd *exec.Cmd, serverName string, serverStatus map[string]string) {
	// プロセスの終了を待機
	err := cmd.Wait()
	if err != nil {
		exitErr, ok := err.(*exec.ExitError)
		if ok {
			exitCode := exitErr.ExitCode()
			slog.Error("MCP Server crashed",
				"server", serverName,
				"exitCode", exitCode)

			// ステータスを更新
			serverStatus[serverName] = "crashed"

			// 次のリクエストで SERVER_CRASHED を返す
		}
	}
}
```

---

### タイムアウト時

**動作**:

1. タイムアウトを検知
2. Tool 呼び出しをキャンセル（JSON-RPC Cancel Request は送信しない）
3. ユーザーに `TIMEOUT_ERROR` を返却
4. MCP Server プロセスは維持

**エラーレスポンス**:

```json
{
  "success": false,
  "error": {
    "code": "TIMEOUT_ERROR",
    "message": "Tool execution timed out after 30000ms",
    "details": {
      "toolName": "slow-operation",
      "timeout": 30000
    }
  }
}
```

**注意事項**:

- JSON-RPC Cancel Request は MCP 仕様ではオプション
- 初期実装では Cancel Request を送信しない
- Tool 実行が完了するまで MCP Server 側で処理が続く可能性がある

---

## 脅威モデル

### 脅威と対策一覧

| 脅威                             | 説明                           | 対策                     | 実装状況              |
| -------------------------------- | ------------------------------ | ------------------------ | --------------------- |
| **インジェクション攻撃**         | toolName への不正な文字列注入  | 正規表現バリデーション   | ✅ 実装済み           |
| **Prototype Pollution**          | `__proto__` などを利用した攻撃 | 禁止キーのチェック       | ✅ 実装済み           |
| **DoS攻撃（サイズ）**            | 巨大な input による攻撃        | サイズ制限（100KB）      | ✅ 実装済み           |
| **DoS攻撃（ネスト）**            | 深くネストされた input         | ネスト深さ制限（10階層） | ✅ 実装済み           |
| **DoS攻撃（タイムアウト）**      | 長時間実行される Tool          | タイムアウト設定（30秒） | ✅ 実装済み           |
| **情報漏洩（エラーメッセージ）** | 内部実装の詳細を含むエラー     | エラーメッセージの抽象化 | ✅ 実装済み           |
| **情報漏洩（ログ）**             | 機密情報のログ記録             | ログ記録の制限           | ✅ 実装済み           |
| **XSS攻撃**                      | 出力に含まれるスクリプト       | フロントエンド側で対応   | ⚠️ フロントエンド責務 |
| **CSRF攻撃**                     | クロスサイトリクエスト         | フロントエンド側で対応   | ⚠️ フロントエンド責務 |

---

## OWASP Top 10 対応状況

### A01:2021 – Broken Access Control

**対策**:

- MCP Gateway 自体にはユーザー認証機能なし
- restexec コンテナからのリクエストのみを想定
- 将来的には API キー認証を検討

**現状**: ⚠️ 内部ネットワーク前提（認証なし）

### A02:2021 – Cryptographic Failures

**対策**:

- HTTPS 通信は上位レイヤー（ロードバランサー）で実施
- 環境変数の暗号化は config.yaml レベルで対応

**現状**: ⚠️ HTTPS は上位レイヤー責務

### A03:2021 – Injection

**対策**:

- toolName の正規表現バリデーション
- input のサニタイズ
- Prototype Pollution 対策

**現状**: ✅ 実装済み

### A04:2021 – Insecure Design

**対策**:

- プロセス分離モデル
- タイムアウト設定
- リソース制限

**現状**: ✅ 実装済み

### A05:2021 – Security Misconfiguration

**対策**:

- デフォルトでセキュアな設定
- `DISABLE_VALIDATION` は明示的に有効化が必要
- ログレベルの適切な設定

**現状**: ✅ 実装済み

### A06:2021 – Vulnerable and Outdated Components

**対策**:

- Go 1.21+（最新版）
- go.mod でバージョン固定
- 定期的な依存関係の更新（`go get -u` および `go mod tidy`）

**現状**: ✅ 実装済み

### A07:2021 – Identification and Authentication Failures

**対策**:

- 現状は認証機能なし（内部ネットワーク前提）

**現状**: ⚠️ 将来実装を検討

### A08:2021 – Software and Data Integrity Failures

**対策**:

- 外部ライブラリのバージョン固定
- MCP Server からの出力サニタイズ

**現状**: ✅ 実装済み

### A09:2021 – Security Logging and Monitoring Failures

**対策**:

- 構造化ログ
- エラーログの記録
- 機密情報のログ除外

**現状**: ✅ 実装済み

### A10:2021 – Server-Side Request Forgery (SSRF)

**対策**:

- MCP Gateway は外部 HTTP リクエストを送信しない
- STDIO Transport のみサポート

**現状**: ✅ 実装済み（該当なし）

---

## ログ記録のセキュリティ

### 記録される情報

**記録する**:

- リクエストメソッドとパス
- toolName（Tool 名）
- サーバー名
- エラーコード
- タイムスタンプ

**記録しない**:

- input パラメータの値（機密情報の可能性）
- result の内容（機密情報の可能性）
- 環境変数の値
- 内部実装の詳細（スタックトレースは `LOG_INCLUDE_STACK=true` 時のみ）

**ログ形式**:

- 構造化ログ(JSON) を使用する

### ログレベルと機密情報

| ログレベル | スタックトレース | 環境変数      | input/result  |
| ---------- | ---------------- | ------------- | ------------- |
| DEBUG      | ✅ 記録          | ❌ 記録しない | ❌ 記録しない |
| INFO       | ❌ 記録しない    | ❌ 記録しない | ❌ 記録しない |
| WARN       | ❌ 記録しない    | ❌ 記録しない | ❌ 記録しない |
| ERROR      | ⚠️ 条件付き      | ❌ 記録しない | ❌ 記録しない |

※ `LOG_INCLUDE_STACK=true` の場合のみスタックトレースを記録

---

## セキュリティベストプラクティス

### 本番環境での推奨設定

1. **DISABLE_VALIDATION を絶対に有効にしない**
   ```bash
   # ❌ 絶対にやらないこと
   export DISABLE_VALIDATION=true
   ```

2. **適切なログレベルを設定**
   ```bash
   # ✅ 本番環境
   export LOG_LEVEL=INFO
   export LOG_INCLUDE_STACK=false

   # ✅ 開発環境
   export LOG_LEVEL=DEBUG
   export LOG_INCLUDE_STACK=true
   ```

3. **タイムアウトを適切に設定**
   ```yaml
   # config.yaml
   servers:
     - name: weather-server
       timeout: 30000 # 30秒（適切な値を設定）
   ```

4. **最小権限の原則**
   - MCP Server に渡す環境変数は最小限に
   - 不要な環境変数は渡さない

5. **定期的な監査**
   - ログを定期的にレビュー
   - 異常なリクエストパターンを検知
   - クラッシュの原因を調査

---

## 関連ドキュメント

- [API.md](API.md) - エラーレスポンス仕様
- [SystemArchitecture.md](SystemArchitecture.md) - プロセス分離モデル
- [MCPProtocol.md](MCPProtocol.md) - MCP Server との通信セキュリティ
- [Configuration.md](Configuration.md) - セキュリティ関連の環境変数
