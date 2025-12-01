# restexec

このリポジトリは、複数のサービスを管理するモノレポ構造です。

## 📦 サービス一覧

### 🚀 restexec

REST API経由でTypeScriptコードを安全に実行するサービスです。Denoの厳格なパーミッションシステムにより、ファイルシステム、ネットワーク、プロセス実行を細かく制御できます。

- **技術スタック**: Deno, TypeScript, Oak Framework
- **ポート**: 3000
- **ディレクトリ**: [services/restexec/](services/restexec/)
- **詳細**: [services/restexec/README.md](services/restexec/README.md)

**主な機能:**
- TypeScriptコードの動的実行
- 厳格なパーミッション制御
- タイムアウト管理
- 共有ライブラリのサポート

**アーキテクチャ:**
```
Client → HTTP API → Code Executor → Deno Process → Result
```

詳細なアーキテクチャ図は [services/restexec/README.md](services/restexec/README.md#システムアーキテクチャ) を参照してください。

---

### 🌉 MCP Gateway

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーへのHTTPアクセスを提供するゲートウェイサービスです。複数のMCPサーバープロセスを管理し、RESTful API経由でツール呼び出しを実行します。

- **技術スタック**: Go, Gin Framework, MCP SDK
- **ポート**: 3001
- **ディレクトリ**: [services/mcp-gateway/](services/mcp-gateway/)
- **詳細**: [services/mcp-gateway/README.md](services/mcp-gateway/README.md)

**主な機能:**
- 複数MCPサーバーの管理
- HTTP API経由のツール呼び出し
- プロセス監視とヘルスチェック
- 入力バリデーションとセキュリティ対策

**アーキテクチャ:**
```
Client → HTTP API → Client Manager → MCP Server Process → Tool Execution
```

詳細なアーキテクチャ図は [services/mcp-gateway/specs/SystemArchitecture.md](services/mcp-gateway/specs/SystemArchitecture.md) を参照してください。

---

## 🚀 クイックスタート

### Docker Compose で全サービスを起動

```bash
# 設定ファイルを準備
cp services/mcp-gateway/config/config.example.yaml services/mcp-gateway/config/config.yaml

# 全サービスを起動
docker compose up -d

# ログを確認
docker compose logs -f

# 停止
docker compose down
```

#### MCP Gateway の起動準備

MCP Gateway を使用する場合、設定ファイルを作成する必要があります：

```bash
# サンプル設定ファイルをコピー
cp services/mcp-gateway/config/config.example.yaml services/mcp-gateway/config/config.yaml

# config.yaml を編集して、使用する MCP サーバーを定義
# デフォルトではテストサーバーが設定されています
vim services/mcp-gateway/config/config.yaml
```

設定ファイルの詳細は [services/mcp-gateway/specs/Configuration.md](services/mcp-gateway/specs/Configuration.md) を参照してください。

#### 特定のサービスのみを起動

```bash
# restexec のみ
docker compose up -d restexec

# mcp-gateway のみ
docker compose up -d mcp-gateway
```

### restexec サービス（ローカル開発）

```bash
# Docker Composeで起動
docker compose up -d restexec

# ヘルスチェック
curl http://localhost:3000/health

# TypeScriptコードを実行
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "scriptPath": "/workspace/hello-world.ts",
    "timeout": 5000
  }'

# 停止
docker compose down
```

### MCP Gateway サービス（ローカル開発）

```bash
# サービスディレクトリに移動
cd services/mcp-gateway

# 設定ファイルを準備
cp config/config.example.yaml config/config.yaml

# ビルド
go build -o mcp-gateway ./cmd/mcp-gateway

# 実行
./mcp-gateway

# または、開発モードで実行
go run ./cmd/mcp-gateway

# ヘルスチェック
curl http://localhost:3001/health

# ツールリスト取得
curl http://localhost:3001/mcp/tools

# ツール呼び出し
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "test-server",
    "toolName": "calculate-bmi",
    "input": {
      "height_m": 1.75,
      "weight_kg": 70.0
    }
  }'
```

---

## 🛠️ ローカル開発

### restexec

```bash
cd services/restexec

# 依存関係をキャッシュ
deno task cache

# テストを実行
deno task test

# ローカルで起動
deno task dev

# フォーマット
deno task fmt

# リント
deno task lint
```

### MCP Gateway

```bash
cd services/mcp-gateway

# 依存関係のインストール
go mod download

# テストを実行
go test ./...

# ローカルで起動
go run ./cmd/mcp-gateway

# フォーマット
go fmt ./...

# リント
golangci-lint run
```

---

## 📁 プロジェクト構造

```
restexec/
├── services/
│   ├── restexec/              # TypeScript実行サービス (Deno)
│   │   ├── src/               # ソースコード
│   │   ├── tests/             # テストスイート
│   │   ├── specs/             # 仕様書
│   │   ├── example/           # サンプルコード
│   │   ├── Dockerfile         # Docker設定
│   │   └── README.md          # サービスドキュメント
│   │
│   └── mcp-gateway/           # MCPゲートウェイサービス (Go)
│       ├── cmd/               # エントリーポイント
│       ├── internal/          # 内部パッケージ
│       ├── pkg/               # 公開パッケージ
│       ├── tests/             # テストコード
│       ├── specs/             # 仕様書
│       ├── config/            # 設定ファイル
│       └── README.md          # サービスドキュメント
│
├── .github/                   # CI/CD設定
├── .agent/                    # エージェント設定
├── compose.yaml               # Docker Compose設定
├── LICENSE                    # ライセンス
└── README.md                  # このファイル
```

---

## 🧪 テスト

### 全サービスのテスト実行

```bash
# restexec のテスト
cd services/restexec && deno task test

# mcp-gateway のテスト
cd services/mcp-gateway && go test ./...
```

---

## 📚 ドキュメント

### restexec
- [README](services/restexec/README.md) - サービス概要
- [API仕様](services/restexec/specs/API.md) - エンドポイント詳細
- [システムアーキテクチャ](services/restexec/specs/SystemArchitecture.md) - アーキテクチャ設計
- [セキュリティ](services/restexec/specs/Security.md) - セキュリティ対策
- [ライブラリ管理](services/restexec/specs/Libraries.md) - 外部ライブラリの追加方法
- [Docker ガイド](services/restexec/DOCKER.md) - Docker 使用方法

### MCP Gateway
- [README](services/mcp-gateway/README.md) - サービス概要
- [API仕様](services/mcp-gateway/specs/API.md) - エンドポイント詳細
- [システムアーキテクチャ](services/mcp-gateway/specs/SystemArchitecture.md) - アーキテクチャ設計
- [セキュリティ](services/mcp-gateway/specs/Security.md) - セキュリティ対策
- [設定仕様](services/mcp-gateway/specs/Configuration.md) - 環境変数と設定ファイル
- [MCPプロトコル](services/mcp-gateway/specs/MCPProtocol.md) - MCP実装詳細

---

## 🔒 セキュリティ

両サービスとも、セキュリティを重視した設計になっています：

### restexec
- Denoの厳格なパーミッションシステム
- `--cached-only` フラグによる外部モジュールダウンロードの禁止
- タイムアウト制御
- プロセス分離

### MCP Gateway
- 入力バリデーション（go-playground/validator）
- リクエストサイズ制限（100KB）
- オブジェクト深度制限（最大10階層）
- プロセス分離とクラッシュ検出

詳細は各サービスの `specs/Security.md` を参照してください。

---

## 🤝 貢献

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

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

---

## 🔗 関連リンク

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - MCP公式サイト
- [Deno](https://deno.land/) - Deno公式サイト
- [Go](https://go.dev/) - Go公式サイト
