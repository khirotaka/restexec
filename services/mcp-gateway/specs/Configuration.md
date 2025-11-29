# 環境変数

## サーバー設定

| 変数名              | デフォルト値 | 説明                                                                                                                                                                                                |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | 3001         | HTTPサーバーのリスニングポート                                                                                                                                                                      |
| `LOG_LEVEL`         | info         | ログレベル (DEBUG, INFO, WARN, ERROR)                                                                                                                                                               |
| `LOG_INCLUDE_STACK` | false        | エラーログにスタックトレースを含めるか。<br>• `true`: 常にスタックトレースを出力<br>• `false`または未設定: LOG_LEVEL=debug以外では出力しない<br>• LOG_LEVEL=debugの場合: この設定に関わらず常に出力 |

## 実行設定

| 変数名                  | デフォルト値        | 説明                                    |
| ----------------------- | ------------------- | --------------------------------------- |
| `DEFAULT_TIMEOUT`       | 30000               | デフォルトタイムアウト（ミリ秒）        |
| `MAX_TIMEOUT`           | 300000              | 最大タイムアウト（ミリ秒）              |
| `CONFIG_PATH`           | /config/config.yaml | MCP Server 設定ファイルのパス           |
| `HEALTH_CHECK_INTERVAL` | 30000               | MCP Server ヘルスチェック間隔（ミリ秒） |

## セキュリティ設定

| 変数名                      | デフォルト値 | 説明                                                                                         |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `DISABLE_VALIDATION`        | false        | バリデーション/サニタイズを無効化（**本番環境では使用禁止**）                                |
| `MCP_SERVER_RESTART_POLICY` | never        | MCP Server クラッシュ時の再起動ポリシー ("never", "on-failure") ※現在は "never" のみサポート |

---

# config.yaml 仕様

## 全体構造

```yaml
servers:
  - name: weather-server
    command: /mcp-servers/weather/server
    args: ['--port', '8080', '--path', '/some path']
    envs:
      - name: API_KEY
        value: ${API_KEY}
      - name: DEBUG_MODE
        value: 'true'
    timeout: 30000

  - name: database-server
    command: /mcp-servers/database/server
    timeout: 60000

  - name: health-server
    command: /mcp-servers/health/server
```

---

## フィールド仕様

### servers (必須)

**型**: `array`

MCP Server の配列。最低1つ以上のサーバーが必要。

**制約**:

- 必須フィールド
- 空の配列は不可
- 最大個数: 制限なし（ただし OS のプロセス数制限に依存）

---

### servers[].name (必須)

**型**: `string`

**説明**: MCP Server の一意な名前

**制約**:

- 必須
- 英数字、ハイフン、アンダースコアのみ (`/^[a-zA-Z0-9-_]+$/`)
- 最大長: 50文字
- 同じ名前の Server は定義できない（一意性制約）

**例**:

```yaml
name: weather-server
```

**不正な例**:

```yaml
# ❌ 特殊文字を含む
name: weather@server

# ❌ スペースを含む
name: weather server

# ❌ 空文字列
name: ''
```

---

### servers[].command (STDIO Transport の場合必須)

**型**: `string`

**説明**: MCP Server の実行コマンド

**制約**:

- `command` または `url` のいずれか必須
- 絶対パスまたは相対パス
- 実行可能ファイルが存在すること
- PATH 環境変数でコマンドが解決できること

**例**:

```yaml
# 絶対パス
command: /usr/local/bin/mcp-server

# 相対パス
command: ./bin/mcp-server

# PATH から解決
command: mcp-server
```

**注意事項**:

- コンテナ内で実行される場合、コンテナ内のパスを指定
- シェルスクリプトの場合、shebang (`#!/bin/bash`) が必要
- 実行権限（`chmod +x`）を付与すること

---

### servers[].args (オプション)

**型**: `string`

**説明**: MCP Server に渡すコマンドライン引数

**制約**:

- オプション（省略可能）
- 文字列として指定（スペース区切り）
- 最大長: 1000文字

**例**:

```yaml
# 単一引数
args: '--verbose'

# 複数引数
args:
  - '--port'
  - '8080'
  - '--verbose'

# 環境変数展開（シェル展開は行われない）
args: '--api-key ${API_KEY}' # ❌ 展開されない
```

**注意事項**:

- シェル展開は行われない（`${VAR}` は展開されない）
- 引数にスペースを含む場合はクォート不要（単純に分割される）
- 環境変数を渡したい場合は `envs` フィールドを使用

---

### servers[].envs (オプション)

**型**: `array`

**説明**: MCP Server に渡す環境変数の配列

**制約**:

- オプション（省略可能）
- 最大50個
- 各環境変数は `name` と `value` を持つ
- キー名: 大文字英数字とアンダースコアのみ (`/^[A-Z0-9_]+$/`)
- 値の最大長: 1000文字
- 環境変数を展開する場合、デフォルト値記法には対応しない

**例**:

```yaml
envs:
  - name: API_KEY
    value: 'secret-key-12345' # ハードコード (開発時)
  - name: API_KEY_FROM_ENV
    value: ${API_KEY_FROM_ENV} # 環境変数から展開
  - name: DEBUG_MODE
    value: 'true'
  - name: DB_HOST
    value: 'localhost'
  - name: DB_PORT
    value: '5432'
```

**不正な例**:

```yaml
envs:
  # ❌ 小文字を含む
  - name: api_key
    value: 'secret'

  # ❌ ハイフンを含む
  - name: API-KEY
    value: 'secret'

  # ❌ 値が長すぎる（1000文字超）
  - name: LONG_VALUE
    value: 'very long string...' # 1001文字以上
```

**備考**
Go言語では、標準ライブラリの`os.ExpandEnv`を使用して環境変数を展開します：

```go
import (
	"os"

	"github.com/goccy/go-yaml"
)

// YAML読み込みと環境変数の展開
func loadConfig(configPath string) (*Config, error) {
	// YAMLファイルを読み込み
	yamlContent, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// 環境変数を展開
	// ${VAR_NAME} または $VAR_NAME 形式をサポート
	expandedContent := os.ExpandEnv(string(yamlContent))

	// YAMLパース
	var config Config
	if err := yaml.Unmarshal([]byte(expandedContent), &config); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	return &config, nil
}
```

**`os.ExpandEnv`の動作**:
- `${VAR_NAME}` 形式と `$VAR_NAME` 形式の両方をサポート
- 環境変数が存在しない場合は空文字列に置換
- シェルスクリプトと同じ展開ルール

**使用例**:
```yaml
# config.yaml
servers:
  - name: weather-server
    command: /usr/local/bin/weather-server
    envs:
      - name: API_KEY
        value: ${WEATHER_API_KEY}  # 環境変数から展開
      - name: DEBUG_MODE
        value: "true"
```

これにより、config.yamlに`${API_KEY}`と記述すると、実行時に環境変数`API_KEY`の値に置換されます。

**セキュリティ考慮事項**:

- 機密情報（API KEY など）は config.yaml に直接記載せず、外部ファイルや環境変数から読み込むことを推奨
- config.yaml はバージョン管理に含めない、または機密情報をマスクすること

---

### servers[].timeout (オプション)

**型**: `number`

**説明**: Tool 呼び出しのタイムアウト（ミリ秒）

**制約**:

- オプション（省略可能）
- デフォルト値: `DEFAULT_TIMEOUT` (30000ms)
- 最小値: 1ms
- 最大値: `MAX_TIMEOUT` (300000ms = 5分)

**例**:

```yaml
# 30秒
timeout: 30000

# 1分
timeout: 60000

# 5分（最大値）
timeout: 300000
```

**不正な例**:

```yaml
# ❌ 最大値を超える
timeout: 400000

# ❌ 負の値
timeout: -1000

# ❌ 文字列
timeout: '30000'
```

---

### servers[].url (HTTP/SSE Transport の場合必須) ※将来実装

**型**: `string`

**説明**: MCP Server の HTTP エンドポイント

**制約**:

- `command` または `url` のいずれか必須
- 有効な URL 形式（http:// または https://）
- ポート番号を含めることが推奨

**例**:

```yaml
# StreamableHTTP Transport
url: http://example.com/mcp

# SSE Transport
url: http://example.com/mcp/events

# HTTPS
url: https://secure.example.com/mcp
```

**注意事項**:

- 現在は STDIO Transport のみサポート
- `url` が指定されている場合、起動時にエラーを返す
- 将来実装予定

---

## バリデーションルール

### 起動時バリデーション

MCP Gateway は起動時に config.yaml をバリデーションします：

**必須フィールドチェック**:

- `servers` が存在するか
- 各 Server に `name` が存在するか
- 各 Server に `command` または `url` が存在するか

**一意性チェック**:

- Server 名が重複していないか

**形式チェック**:

- `name` が正規表現 `/^[a-zA-Z0-9-_]+$/` にマッチするか
- `timeout` が数値型で範囲内か
- `envs` が配列型か

**エラー例**:

```
Error: Invalid config.yaml: Server name 'weather-server' is duplicated
Error: Invalid config.yaml: servers[0].name contains invalid characters
Error: Invalid config.yaml: servers[1].timeout exceeds maximum value (300000)
Error: Invalid config.yaml: servers[0] must have either 'command' or 'url'
```

**バリデーション失敗時の動作**:

- MCP Gateway は起動せず、エラーメッセージを出力して終了
- exit code 1 を返す

---

### ランタイムバリデーション

**config.yaml の変更検知**:

- ランタイム時は config.yaml の変更を**検知しません**
- 設定を変更する場合はコンテナを再起動してください

**理由**:

- シンプルな実装
- 設定変更時の影響範囲を限定
- プロセス管理の複雑さを回避

---

## 設定例

### 最小構成

```yaml
servers:
  - name: simple-server
    command: /usr/local/bin/mcp-server
```

**説明**:

- 最もシンプルな設定
- タイムアウトはデフォルト（30秒）
- 環境変数なし

---

### 複数サーバー構成

```yaml
servers:
  - name: weather-server
    command: /mcp-servers/weather/server
    args:
      - '--api-version'
      - 'v2'
    envs:
      - name: WEATHER_API_KEY
        value: 'your-api-key'
    timeout: 30000

  - name: database-server
    command: /mcp-servers/database/server
    envs:
      - name: DB_HOST
        value: 'localhost'
      - name: DB_PORT
        value: '5432'
      - name: DB_USER
        value: 'postgres'
      - name: DB_PASSWORD
        value: 'password'
    timeout: 60000

  - name: health-server
    command: /mcp-servers/health/server
    timeout: 10000
```

**説明**:

- 3つの MCP Server を定義
- 各 Server で異なるタイムアウト設定
- database-server には複数の環境変数を設定

---

### 開発環境向け設定

```yaml
servers:
  - name: dev-server
    command: go
    args:
      - run
      - ./cmd/dev-server/main.go
    envs:
      - name: DEBUG_MODE
        value: 'true'
      - name: LOG_LEVEL
        value: 'DEBUG'
    timeout: 120000 # 開発時は長めのタイムアウト
```

**説明**:

- Go で MCP Server を実行
- デバッグモードを有効化
- 長めのタイムアウト（2分）

---

## config.yaml の配置

### Dockerコンテナ内

**デフォルトパス**: `/config/config.yaml`

**Dockerfileの例**:

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Go モジュールファイルをコピー
COPY go.mod go.sum ./
RUN go mod download

# ソースコードをコピー
COPY . .

# ビルド
RUN go build -o mcp-gateway ./cmd/mcp-gateway

# 実行用の軽量イメージ
FROM alpine:latest

WORKDIR /app

# ビルド済みバイナリをコピー
COPY --from=builder /app/mcp-gateway .

# config.yaml をコピー
COPY config.yaml /config/config.yaml

CMD ["./mcp-gateway"]
```

**docker-compose.yamlの例**:

```yaml
services:
  mcp-gateway:
    build: .
    ports:
      - '3001:3001'
    volumes:
      # config.yaml をボリュームマウント（開発時）
      - ./config.yaml:/config/config.yaml:ro
    environment:
      - PORT=3001
      - LOG_LEVEL=INFO
      - CONFIG_PATH=/config/config.yaml
```

---

### 環境変数での上書き

**CONFIG_PATH 環境変数**:

```bash
export CONFIG_PATH=/custom/path/config.yaml
```

または

```yaml
# docker-compose.yaml
services:
  mcp-gateway:
    environment:
      - CONFIG_PATH=/custom/path/config.yaml
```

---

## トラブルシューティング

### 問題: config.yaml が見つからない

**エラーメッセージ**:

```
Error: Config file not found: /config/config.yaml
```

**原因**:

- config.yaml が存在しない
- パスが間違っている
- ファイル権限が不正

**解決方法**:

```bash
# ファイルの存在確認
ls -la /config/config.yaml

# 権限確認
chmod 644 /config/config.yaml

# カスタムパスを指定
export CONFIG_PATH=/path/to/config.yaml
```

---

### 問題: Server 名が重複している

**エラーメッセージ**:

```
Error: Invalid config.yaml: Server name 'weather-server' is duplicated
```

**原因**:

- 同じ名前の Server が複数定義されている

**解決方法**:

```yaml
# ❌ 重複している
servers:
  - name: weather-server
    command: /server1
  - name: weather-server # 重複
    command: /server2

# ✅ 一意な名前に変更
servers:
  - name: weather-server-1
    command: /server1
  - name: weather-server-2
    command: /server2
```

---

### 問題: タイムアウトが短すぎる

**症状**:

- Tool 呼び出しが頻繁にタイムアウトする

**解決方法**:

```yaml
servers:
  - name: slow-server
    command: /mcp-servers/slow-server
    timeout: 120000 # 2分に延長
```

または

```bash
# デフォルトタイムアウトを延長
export DEFAULT_TIMEOUT=60000
```

---

### 問題: 環境変数が反映されない

**症状**:

- MCP Server 内で環境変数が取得できない

**原因**:

- `envs` の記法が間違っている
- キー名が不正（小文字や特殊文字を含む）

**解決方法**:

```yaml
# ❌ 間違った記法
servers:
  - name: my-server
    command: /server
    envs:
      API_KEY: 'secret' # オブジェクト形式は不可

# ✅ 正しい記法
servers:
  - name: my-server
    command: /server
    envs:
      - name: API_KEY
        value: 'secret'
```

---

## ベストプラクティス

### 1. 機密情報の管理

**推奨**:

- 機密情報は外部ファイルや環境変数から読み込む
- config.yaml はバージョン管理に含めない

**例**:

```yaml
# config.yaml.example（テンプレート）
servers:
  - name: weather-server
    command: /mcp-servers/weather/server
    envs:
      - name: WEATHER_API_KEY
        value: 'YOUR_API_KEY_HERE' # プレースホルダー
```

```bash
# 実際の値は環境変数から注入
export WEATHER_API_KEY="actual-secret-key"
```

---

### 2. タイムアウトの設定

**推奨**:

- Server の特性に応じて適切なタイムアウトを設定
- 高速な Tool: 10秒以下
- 通常の Tool: 30秒
- 重い処理の Tool: 60秒以上

**例**:

```yaml
servers:
  - name: fast-server
    command: /mcp-servers/fast
    timeout: 10000 # 10秒

  - name: normal-server
    command: /mcp-servers/normal
    timeout: 30000 # 30秒

  - name: heavy-server
    command: /mcp-servers/heavy
    timeout: 120000 # 2分
```

---

### 3. 環境変数の最小化

**推奨**:

- 必要最小限の環境変数のみを渡す
- 不要な環境変数は渡さない

**例**:

```yaml
# ❌ 悪い例: 不要な環境変数
servers:
  - name: my-server
    command: /server
    envs:
      - name: HOME
        value: '/root'
      - name: PATH
        value: '/usr/bin'
      - name: USER
        value: 'root'

# ✅ 良い例: 必要な環境変数のみ
servers:
  - name: my-server
    command: /server
    envs:
      - name: API_KEY
        value: 'secret'
```

---

## 関連ドキュメント

- [API.md](API.md) - HTTP エンドポイント仕様
- [SystemArchitecture.md](SystemArchitecture.md) - Config Loader コンポーネント
- [Security.md](Security.md) - 環境変数のセキュリティ
- [MCPProtocol.md](MCPProtocol.md) - MCP Server プロセス起動
