# MCP Gateway

MCP Gateway は、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーへの HTTP アクセスを提供するゲートウェイサービスです。複数の MCP サーバープロセスを管理し、RESTful API を通じてツール呼び出しを実行します。

## 概要

MCP Gateway は以下の機能を提供します：

- **複数 MCP サーバーの管理**: 設定ファイルで定義された複数の MCP サーバーを起動・監視
- **HTTP API**: REST API 経由で MCP ツールを呼び出し
- **ヘルスチェック**: MCP プロトコル ping による定期的な稼働確認
- **自動再起動**: クラッシュ検出時の自動再起動（最大3回、指数バックオフ）
- **セキュリティ**: 入力バリデーション、リクエストサイズ制限、オブジェクト深度制限
- **ツールリスト取得**: 利用可能なツール一覧の取得とキャッシング

## 主な機能

### 1. ツール呼び出し (POST /mcp/call)
指定した MCP サーバーのツールを HTTP 経由で実行します。

```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "calculate-bmi",
    "input": {"weight_kg": 70, "height_m": 1.75}
  }'
```

### 2. ツールリスト取得 (GET /mcp/tools)
利用可能な全ツールのリストを取得します。

```bash
curl http://localhost:3001/mcp/tools
```

### 3. ヘルスチェック (GET /health)
MCP サーバーの稼働状況を確認します。

```bash
curl http://localhost:3001/health
```

## クイックスタート

### 前提条件

- [Go](https://go.dev/) 1.21 以降

### 1. 設定ファイルの作成

`config/config.yaml` を作成し、MCP サーバーの設定を記述します：

```yaml
servers:
  - name: health-server
    command: /path/to/health-server
    args:
      - --port
      - "8080"
    envs:
      - name: API_KEY
        value: your-api-key
```

### 2. サーバーの起動

```bash
# ビルド
go build -o mcp-gateway ./cmd/mcp-gateway

# 実行
./mcp-gateway

# または、ビルドせずに直接実行（開発モード）
go run ./cmd/mcp-gateway
```

サーバーは `http://localhost:3001` で起動します。

### 3. 動作確認

```bash
# ヘルスチェック
curl http://localhost:3001/health

# ツールリスト取得
curl http://localhost:3001/mcp/tools

# ツール呼び出し
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "example-tool",
    "input": {}
  }'
```

## 開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd services/mcp-gateway
```

### 2. 依存関係のインストール

```bash
# Go モジュールの初期化（初回のみ）
go mod init github.com/khirotaka/restexec/services/mcp-gateway

# 主要な依存関係の追加
go get github.com/gin-gonic/gin@latest
go get github.com/goccy/go-yaml@latest
go get github.com/go-playground/validator/v10@latest
go get github.com/modelcontextprotocol/go-sdk@latest

# 依存関係のダウンロード
go mod download

# go.mod と go.sum を整理
go mod tidy
```

### 3. 環境変数の設定（オプション）

```bash
# ポート番号の変更（デフォルト: 3001）
export PORT=3001

# ログレベルの設定（デフォルト: INFO）
export LOG_LEVEL=DEBUG

# ヘルスチェック間隔（デフォルト: 30000ms）
export HEALTH_CHECK_INTERVAL=30000

# MCP サーバー再起動ポリシー（デフォルト: never）
# "never": 再起動しない、"on-failure": 最大3回まで指数バックオフで再起動
export MCP_SERVER_RESTART_POLICY=never

# 設定ファイルパス（デフォルト: ./config/config.yaml）
export CONFIG_PATH=./config/config.yaml

# バリデーション無効化（開発用のみ、本番環境では使用不可）
export DISABLE_VALIDATION=false
```

### 4. 開発サーバーの起動

```bash
# ホットリロード付きで起動（air を使用）
air

# または、通常の起動
go run ./cmd/mcp-gateway
```

## テストの実行

### 全テストの実行

```bash
go test ./...
```

### 特定のパッケージのテスト

```bash
# 統合テスト
go test ./tests/integration/...

# セキュリティテスト
go test ./tests/security/...

# ハンドラーテスト
go test ./internal/http/...
```

### テストカバレッジ

```bash
# カバレッジレポートを生成
go test -coverprofile=coverage.out ./...

# カバレッジをブラウザで表示
go tool cover -html=coverage.out
```

## ディレクトリ構造

```
mcp-gateway/
├── cmd/                     # アプリケーションエントリーポイント
│   └── mcp-gateway/         # メインアプリケーション
│       └── main.go          # エントリーポイント
├── internal/                # 内部パッケージ
│   ├── config/              # 設定管理
│   │   └── loader.go        # YAML設定ファイルローダー
│   ├── http/                # HTTP層
│   │   ├── server.go        # HTTPサーバー
│   │   ├── router.go        # ルーティング
│   │   └── handlers.go      # リクエストハンドラー
│   ├── mcp/                 # MCPクライアント管理
│   │   ├── client_manager.go  # MCPクライアントマネージャー
│   │   └── process_manager.go # プロセス管理・監視
│   ├── validator/           # バリデーション
│   │   └── validator.go     # リクエストバリデーター
│   └── logger/              # ロギング
│       └── logger.go        # 構造化ロガー
├── pkg/                     # 公開パッケージ
│   └── errors/              # エラー定義
│       └── errors.go        # カスタムエラー
├── tests/                   # テストコード
│   ├── integration/         # 統合テスト
│   │   └── api_test.go      # APIエンドポイントテスト
│   ├── security/            # セキュリティテスト
│   │   └── security_test.go # セキュリティテスト
│   └── testdata/            # テスト用データ
│       ├── config.yaml      # テスト用設定ファイル
│       └── dummy_server.go  # テスト用ダミーサーバー
├── specs/                   # 仕様書
│   ├── API.md               # API仕様
│   ├── SystemArchitecture.md # システムアーキテクチャ
│   ├── Configuration.md     # 設定仕様
│   ├── Security.md          # セキュリティ仕様
│   ├── MCPProtocol.md       # MCPプロトコル仕様
│   └── Sequence.md          # シーケンス図
├── config/                  # 設定ファイル
│   └── config.yaml          # MCP サーバー設定
├── go.mod                   # Go モジュール定義
├── go.sum                   # 依存関係のチェックサム
├── .air.toml                # Air（ホットリロード）設定
└── README.md                # このファイル
```

## API 仕様

詳細な API 仕様は [specs/API.md](specs/API.md) を参照してください。

### エンドポイント一覧

| エンドポイント | メソッド | 説明                       |
| -------------- | -------- | -------------------------- |
| `/mcp/call`    | POST     | MCP Tool 呼び出し          |
| `/mcp/tools`   | GET      | 利用可能な Tool リスト取得 |
| `/health`      | GET      | ヘルスチェック             |

### レスポンス形式

成功時：
```json
{
  "success": true,
  "result": { ... }
}
```

エラー時：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーメッセージ",
    "details": { ... }
  }
}
```

## セキュリティ

MCP Gateway は以下のセキュリティ対策を実装しています：

- **入力バリデーション**: go-playground/validator によるスキーマバリデーション
- **リクエストサイズ制限**: 100KB までの入力制限
- **オブジェクト深度制限**: 最大 10 階層までのネスト
- **プロセス分離**: MCP サーバーは独立したプロセスとして実行
- **タイムアウト**: ツール呼び出しのタイムアウト設定

詳細は [specs/Security.md](specs/Security.md) を参照してください。

## 設定

### 環境変数

| 環境変数                    | デフォルト値           | 説明                                                                  |
| --------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `PORT`                      | `3001`                 | HTTP サーバーのポート番号                                             |
| `LOG_LEVEL`                 | `INFO`                 | ログレベル (`DEBUG`, `INFO`, `WARN`, `ERROR`)                         |
| `CONFIG_PATH`               | `./config/config.yaml` | 設定ファイルのパス                                                    |
| `HEALTH_CHECK_INTERVAL`     | `30000`                | MCP Server へのヘルスチェック間隔（ミリ秒、MCP ping 使用）           |
| `MCP_SERVER_RESTART_POLICY` | `never`                | クラッシュ時の再起動ポリシー (`never`: 再起動しない, `on-failure`: 最大3回再起動、指数バックオフ 1s/2s/4s) |
| `DISABLE_VALIDATION`        | `false`                | バリデーション無効化（開発用のみ、本番環境では使用不可）              |

詳細は [specs/Configuration.md](specs/Configuration.md) を参照してください。

### 設定ファイル (config.yaml)

```yaml
servers:
  - name: server-name          # サーバー名（一意）
    command: /path/to/server   # 実行コマンド
    args:                      # コマンド引数
      - --port
      - "8080"
    env:                       # 環境変数（オプション）
      API_KEY: "your-api-key"
```

## アーキテクチャ

MCP Gateway は以下のコンポーネントで構成されています：

- **HTTP Server**: Gin フレームワークによる HTTP サーバー
- **Client Manager**: MCP クライアントの管理とツールキャッシング
- **Process Manager**: MCP サーバープロセスの起動・監視・クラッシュ検出
- **Config Loader**: YAML 設定ファイルの読み込み

詳細なアーキテクチャは [specs/SystemArchitecture.md](specs/SystemArchitecture.md) を参照してください。

## トラブルシューティング

### MCP サーバーが起動しない

- 設定ファイル (`config/config.yaml`) のパスが正しいか確認
- MCP サーバーのコマンドと引数が正しいか確認
- ログ出力を確認: `export LOG_LEVEL=DEBUG`

### ツール呼び出しがタイムアウトする

- ツールの実装が長時間処理を行っていないか確認
- ヘルスチェックログで MCP サーバーの状態を確認

### バリデーションエラーが発生する

- リクエストボディが仕様に準拠しているか確認 ([specs/API.md](specs/API.md))
- 入力オブジェクトのサイズが 100KB 以下か確認
- ネストの深さが 10 階層以下か確認

## 関連ドキュメント

- [API仕様](specs/API.md) - エンドポイントの詳細仕様
- [システムアーキテクチャ](specs/SystemArchitecture.md) - システム構成とコンポーネント
- [設定仕様](specs/Configuration.md) - 環境変数と設定ファイル
- [セキュリティ仕様](specs/Security.md) - セキュリティ対策とバリデーション
- [MCP プロトコル仕様](specs/MCPProtocol.md) - MCP プロトコルの実装
- [シーケンス図](specs/Sequence.md) - 処理フローの詳細

## 技術スタック

- **言語**: [Go](https://go.dev/) 1.21+
- **Web フレームワーク**: [Gin](https://gin-gonic.com/)
- **バリデーション**: [go-playground/validator](https://github.com/go-playground/validator)
- **MCP SDK**: [github.com/modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk)
- **YAML パーサー**: [github.com/goccy/go-yaml](https://github.com/goccy/go-yaml)
- **ロガー**: [slog](https://pkg.go.dev/log/slog) (標準ライブラリ)

## 開発者向け情報

### コードフォーマット

```bash
# すべてのコードをフォーマット
go fmt ./...

# または gofumpt を使用（より厳密なフォーマット）
gofumpt -l -w .
```

### コードリント

```bash
# golangci-lint を使用
golangci-lint run

# または、個別のリンターを使用
go vet ./...
```

### コミット前チェック

```bash
# フォーマット
go fmt ./...

# リント
golangci-lint run

# テスト
go test ./...
```

すべてのチェックがパスすることを確認してからコミットしてください。

## ライセンス

このプロジェクトのライセンスについては、リポジトリのルートにある LICENSE ファイルを参照してください。

## 貢献

貢献を歓迎します！以下の手順でプルリクエストを送信してください：

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

### コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従ってください：

- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメントのみの変更
- `test:` - テストの追加・修正
- `refactor:` - リファクタリング
- `chore:` - ビルドプロセスやツールの変更

## サポート

問題が発生した場合は、以下を確認してください：

1. [トラブルシューティング](#トラブルシューティング) セクション
2. [仕様書](specs/) の該当ドキュメント
3. Issue を作成して質問
