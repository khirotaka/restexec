# CLAUDE.md - mcp-gateway Development Guide

このドキュメントは、**mcp-gateway サービス**の開発を支援します。

mcp-gateway は、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーへの HTTP アクセスを提供するゲートウェイサービスです。複数の MCP サーバープロセスを管理し、RESTful API を通じてツール呼び出しを実行します。

---

## 🌐 Language Preference / 言語優先設定

**IMPORTANT: Language-First Response Policy**

- **Respond in the same language as the user's request**
- ユーザーが日本語で質問 → 日本語で返答
- ユーザーが英語で質問 → 英語で返答

---

## 📖 Purpose of This Document

このドキュメントは mcp-gateway サービスの開発時に参照する **クイックリファレンスとナビゲーションガイド** です。

詳細な仕様については、常に `specs/` ディレクトリ内のドキュメントを参照してください。このドキュメントは以下を提供します：

- **クイックサマリー** - コアコンセプトの要約
- **設定例** - 一般的なタスクの設定例
- **ポインタ** - 詳細ドキュメントへのリンク
- **トラブルシューティング** - よくある問題と解決方法

---

## 🎯 mcp-gateway Overview

### Core Concepts

1. **MCP サーバー管理**: 設定ファイルで定義された複数の MCP サーバーを起動・監視
2. **HTTP API**: REST API 経由で MCP ツールを呼び出し
3. **プロセス監視**: MCP サーバーのヘルスチェックとクラッシュ検出
4. **セキュリティ**: 入力バリデーション、リクエストサイズ制限、オブジェクト深度制限

### Main Features

- **ツール呼び出し** (POST /mcp/call): 指定した MCP サーバーのツールを実行
- **ツールリスト取得** (GET /mcp/tools): 利用可能な全ツールのリストを取得
- **ヘルスチェック** (GET /health): MCP サーバーの稼働状況を確認

### Target Use Cases

- MCP サーバーの HTTP ラッパー
- マルチ MCP サーバー環境の統合管理
- MCP ツールの REST API 化
- MCP サーバーのプロセスライフサイクル管理

**完全な詳細**: [README.md](README.md), [specs/API.md](specs/API.md)

---

## 🚀 Quick Reference by Task

### Task: Create Configuration File

**最小限の設定** (`config/config.yaml`):

```yaml
servers:
  - name: health-server           # サーバー名（一意）
    command: /path/to/server      # 実行コマンド
    args:                         # コマンド引数（オプション）
      - --port
      - "8080"
    env:                          # 環境変数（オプション）
      API_KEY: "your-api-key"
```

**複数サーバーの設定**:

```yaml
servers:
  - name: health-server
    command: /usr/local/bin/health-mcp-server
    args:
      - --verbose
    env:
      LOG_LEVEL: "DEBUG"
      
  - name: weather-server
    command: /usr/local/bin/weather-mcp-server
    env:
      WEATHER_API_KEY: "secret-key"
```

**重要な要件**:
1. ✅ `name` は各サーバーで一意
2. ✅ `command` は実行可能なパス
3. ✅ `args` と `env` はオプション
4. ❌ 環境変数のキーに `DENO_*` などの予約語は使わない

**完全ガイド**: [specs/Configuration.md](specs/Configuration.md)

---

### Task: Start the Server

**開発モード**:
```bash
# ビルドせずに直接実行
go run ./cmd/mcp-gateway

# または、ホットリロード付き（air を使用）
air
```

**本番モード**:
```bash
# ビルド
go build -o mcp-gateway ./cmd/mcp-gateway

# 実行
./mcp-gateway
```

**Docker Compose で起動**:
```bash
docker compose up -d mcp-gateway
```

**環境変数でカスタマイズ**:
```bash
# ポート番号の変更
PORT=3001 go run ./cmd/mcp-gateway

# ログレベルの変更
LOG_LEVEL=DEBUG go run ./cmd/mcp-gateway

# 設定ファイルパスの変更
CONFIG_PATH=./custom-config.yaml go run ./cmd/mcp-gateway
```

**デフォルト値**:
- Port: `3001`
- Config Path: `./config/config.yaml`
- Log Level: `INFO`
- Health Check Interval: `30000ms`

---

### Task: Call MCP Tools

**基本的なツール呼び出し**:

```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "calculate-bmi",
    "input": {
      "weight_kg": 70,
      "height_m": 1.75
    }
  }'
```

**レスポンス（成功時）**:
```json
{
  "success": true,
  "result": {
    "bmi": 22.86,
    "category": "normal"
  }
}
```

**レスポンス（エラー時）**:
```json
{
  "success": false,
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "Failed to execute tool",
    "details": {
      "server": "health-server",
      "tool": "calculate-bmi"
    }
  }
}
```

**タイムアウトを設定**:
```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "long-running-task",
    "input": {},
    "timeout": 60000
  }'
```

**完全な API 仕様**: [specs/API.md](specs/API.md)

---

### Task: List Available Tools

**すべてのツールをリスト**:

```bash
curl http://localhost:3001/mcp/tools
```

**レスポンス**:
```json
{
  "success": true,
  "result": {
    "tools": [
      {
        "server": "health-server",
        "name": "calculate-bmi",
        "description": "Calculate Body Mass Index",
        "inputSchema": {
          "type": "object",
          "properties": {
            "weight_kg": {"type": "number"},
            "height_m": {"type": "number"}
          },
          "required": ["weight_kg", "height_m"]
        }
      },
      {
        "server": "weather-server",
        "name": "get-forecast",
        "description": "Get weather forecast",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    ]
  }
}
```

**ツールリストはキャッシュされます**:
- MCP サーバー起動時に取得
- 定期的にリフレッシュされる可能性がある
- パフォーマンスのために最適化

---

### Task: Check Server Health

**ヘルスチェック**:

```bash
curl http://localhost:3001/health
```

**レスポンス（すべて正常時）**:
```json
{
  "status": "healthy",
  "servers": {
    "health-server": "running",
    "weather-server": "running"
  },
  "uptime": 12345,
  "timestamp": "2025-11-30T10:00:00Z"
}
```

**レスポンス（一部異常時）**:
```json
{
  "status": "degraded",
  "servers": {
    "health-server": "running",
    "weather-server": "crashed"
  },
  "uptime": 12345,
  "timestamp": "2025-11-30T10:00:00Z"
}
```

**ヘルスチェックの頻度**:
- デフォルト: 30 秒ごと
- 環境変数 `HEALTH_CHECK_INTERVAL` で変更可能

---

### Task: Run Tests

**すべてのテストを実行**:
```bash
go test ./...
```

**カバレッジ付きで実行**:
```bash
# カバレッジレポートを生成
go test -coverprofile=coverage.out ./...

# カバレッジをブラウザで表示
go tool cover -html=coverage.out
```

**特定のパッケージのテスト**:
```bash
# 統合テスト
go test ./tests/integration/...

# セキュリティテスト
go test ./tests/security/...

# ハンドラーテスト
go test ./internal/http/...
```

**Verbose モード**:
```bash
go test -v ./...
```

**テストが失敗する場合**:
1. `config/config.yaml` が存在するか確認
2. テスト用のダミー MCP サーバーが正しく設定されているか確認
3. ログ出力を確認: `go test -v ./...`

---

## 🔧 Troubleshooting

### Problem: MCP サーバーが起動しない

**症状**: ログに "Failed to start MCP server" エラー

**よくある原因**:
1. 設定ファイルのパスが間違っている
2. MCP サーバーのコマンドが見つからない
3. コマンド引数が正しくない
4. 環境変数が不足している

**解決策**:
```bash
# 1. 設定ファイルを確認
cat config/config.yaml

# 2. コマンドが実行可能か確認
which /path/to/server
/path/to/server --help

# 3. ログレベルを DEBUG に設定して詳細を確認
LOG_LEVEL=DEBUG go run ./cmd/mcp-gateway

# 4. 環境変数を確認
env | grep -i config
```

**詳細**: [specs/Configuration.md](specs/Configuration.md)

---

### Problem: ツール呼び出しがタイムアウト

**症状**: `TIMEOUT_ERROR` レスポンス

**よくある原因**:
1. ツールの実装が長時間処理を行っている
2. MCP サーバーが応答していない
3. タイムアウト設定が短すぎる

**解決策**:
```bash
# 1. タイムアウトを増やす
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "long-task",
    "input": {},
    "timeout": 60000
  }'

# 2. ヘルスチェックでサーバーの状態を確認
curl http://localhost:3001/health

# 3. MCP サーバーのログを確認（設定で標準出力を見る）
LOG_LEVEL=DEBUG go run ./cmd/mcp-gateway
```

---

### Problem: バリデーションエラー

**症状**: `VALIDATION_ERROR` レスポンス

**よくある原因**:
1. リクエストボディが API 仕様に準拠していない
2. `input` オブジェクトが 100KB を超えている
3. ネストの深さが 10 階層を超えている
4. 必須フィールドが欠けている

**解決策**:
```bash
# リクエストボディを確認
# 必須フィールド: server, toolName, input

# 正しい例
{
  "server": "health-server",      # 必須: サーバー名
  "toolName": "calculate-bmi",    # 必須: ツール名
  "input": {                      # 必須: 入力オブジェクト
    "weight_kg": 70,
    "height_m": 1.75
  },
  "timeout": 30000                # オプション: タイムアウト（ms）
}
```

**詳細**: [specs/API.md](specs/API.md), [specs/Security.md](specs/Security.md)

---

### Problem: サーバーが "crashed" 状態

**症状**: ヘルスチェックで特定のサーバーが "crashed"

**よくある原因**:
1. MCP サーバープロセスがクラッシュした
2. MCP サーバーが予期せず終了した
3. リソース不足（メモリ、CPU）

**解決策**:
```bash
# 1. ヘルスチェックで状態を確認
curl http://localhost:3001/health

# 2. ログを確認
LOG_LEVEL=DEBUG go run ./cmd/mcp-gateway

# 3. サーバーを再起動（自動再起動は未実装の場合）
# mcp-gateway を再起動すると MCP サーバーも再起動されます
docker compose restart mcp-gateway

# または
killall mcp-gateway
go run ./cmd/mcp-gateway
```

**詳細**: [specs/SystemArchitecture.md](specs/SystemArchitecture.md)

---

### Problem: ツールリストが空

**症状**: `/mcp/tools` のレスポンスでツールが 0 件

**よくある原因**:
1. MCP サーバーが起動していない
2. MCP サーバーがツールを提供していない
3. サーバー起動時のツールリスト取得に失敗

**解決策**:
```bash
# 1. ヘルスチェックでサーバーの状態を確認
curl http://localhost:3001/health

# 2. ログを確認
LOG_LEVEL=DEBUG go run ./cmd/mcp-gateway

# 3. MCP サーバーを直接テスト
/path/to/server --test  # サーバーによって異なる
```

---

### Problem: "server not found" エラー

**症状**: `SERVER_NOT_FOUND` エラーコード

**よくある原因**:
1. リクエストの `server` フィールドが設定ファイルの `name` と一致しない
2. タイポ（大文字小文字の違いを含む）

**解決策**:
```bash
# 1. 設定ファイルでサーバー名を確認
cat config/config.yaml | grep "name:"

# 2. ツールリストで利用可能なサーバーを確認
curl http://localhost:3001/mcp/tools | jq '.result.tools[].server' | sort -u

# 3. 正しいサーバー名を使用
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",    # config.yaml の name と一致させる
    "toolName": "calculate-bmi",
    "input": {}
  }'
```

---

## 📚 Documentation Map

### Essential Documentation

**開発用**:
- **このファイル** (CLAUDE.md) - クイックリファレンスとトラブルシューティング
- [README.md](README.md) - プロジェクト概要とクイックスタート
- [specs/Configuration.md](specs/Configuration.md) - 設定ファイルと環境変数

**API 仕様**:
- [specs/API.md](specs/API.md) - 全エンドポイントの詳細仕様
- [specs/MCPProtocol.md](specs/MCPProtocol.md) - MCP プロトコルの実装詳細

**アーキテクチャ**:
- [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - システム構成とコンポーネント
- [specs/Sequence.md](specs/Sequence.md) - 処理フローの詳細（シーケンス図）

**セキュリティ**:
- [specs/Security.md](specs/Security.md) - セキュリティ対策とバリデーション

---

## 🔑 Key Points for AI Assistants

### When Configuring MCP Servers

1. **設定ファイルは YAML 形式** (`config/config.yaml`)
2. **各サーバーに一意の名前を付ける**
3. **コマンドは絶対パスまたは PATH 内のコマンド**
4. **環境変数はオプション**、サーバーが必要とする場合のみ設定

### When User Asks About...

- **「設定ファイルの書き方は？」** → [Task: Create Configuration File](#task-create-configuration-file) + [specs/Configuration.md](specs/Configuration.md)
- **「サーバーの起動方法は？」** → [Task: Start the Server](#task-start-the-server)
- **「ツールの呼び出し方は？」** → [Task: Call MCP Tools](#task-call-mcp-tools) + [specs/API.md](specs/API.md)
- **「サーバーが起動しない」** → [Troubleshooting](#-troubleshooting) セクション
- **「テストの実行方法は？」** → [Task: Run Tests](#task-run-tests)

### Architecture Questions

詳細なアーキテクチャの質問については、以下を読む：
1. [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - ハイレベル設計
2. [specs/Sequence.md](specs/Sequence.md) - 処理フロー
3. [specs/Security.md](specs/Security.md) - セキュリティモデル
4. `internal/` 内の関連ソースファイル

---

## 🛠️ Technology Stack

- **Language**: Go 1.21+
- **Web Framework**: Gin
- **Validation**: go-playground/validator
- **MCP SDK**: github.com/modelcontextprotocol/go-sdk
- **YAML Parser**: github.com/goccy/go-yaml
- **Logger**: slog (標準ライブラリ)

---

## 📋 Development Workflow

### Before Committing

変更をコミットする前にこれらのチェックを実施：

```bash
# フォーマット
go fmt ./...

# リント（golangci-lint がインストールされている場合）
golangci-lint run

# または、個別のリンター
go vet ./...

# テスト
go test ./...
```

すべてのチェックがエラーや警告なしでパスする必要があります。

### For New Features

1. `specs/` 内の関連仕様を読む
2. 必要に応じて仕様を更新
3. エラーハンドリングを含めて実装
4. 包括的なテストを追加（`tests/` 内）
5. この CLAUDE.md を更新（クイックリファレンスに影響する場合）
6. README.md を更新（ユーザー向けの場合）

### For Bug Fixes

1. 根本原因を特定
2. バグを再現するテストを追加
3. 最小限の修正を実装
4. すべてのテストがパスすることを確認
5. 広く適用可能な場合はトラブルシューティングセクションを更新

### Adding New Dependencies

```bash
# 依存関係を追加
go get github.com/some/package@latest

# go.mod と go.sum を整理
go mod tidy

# ベンダーディレクトリを更新（使用している場合）
go mod vendor
```

---

## 🔐 Security Considerations

mcp-gateway は以下のセキュリティ対策を実装：

- **入力バリデーション**: すべてのリクエストを厳密に検証
- **リクエストサイズ制限**: 100KB までの入力制限
- **オブジェクト深度制限**: 最大 10 階層までのネスト
- **プロセス分離**: MCP サーバーは独立したプロセスとして実行
- **タイムアウト**: すべてのツール呼び出しにタイムアウトを設定

**詳細**: [specs/Security.md](specs/Security.md)

---

## 🌍 Environment Variables

| 環境変数               | デフォルト値            | 説明                                      |
| ---------------------- | ----------------------- | ----------------------------------------- |
| `PORT`                 | `3001`                  | HTTP サーバーのポート番号                 |
| `LOG_LEVEL`            | `INFO`                  | ログレベル (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `CONFIG_PATH`          | `./config/config.yaml`  | 設定ファイルのパス                        |
| `HEALTH_CHECK_INTERVAL` | `30000`                | ヘルスチェック間隔（ミリ秒）              |
| `DISABLE_VALIDATION`   | `false`                 | バリデーション無効化（開発用のみ）        |

**詳細**: [specs/Configuration.md](specs/Configuration.md)

---

*このドキュメントはナビゲーションガイドです。完全な情報については、リンクされたドキュメントファイルを参照してください。*

*Last updated: 2025-11-30*
