# AGENTS.md - AI Assistant Guide

このドキュメントは、AI アシスタントがこの **モノレポプロジェクト** を効率的にナビゲートし、開発を支援するための包括的なガイドです。

---

## 🌐 Language Preference / 言語優先設定

**IMPORTANT: Language-First Response Policy**

When interacting with developers:
- **Respond in the same language as the user's request**
- If the user asks in Japanese → Respond in Japanese (日本語で返答)
- If the user asks in English → Respond in English
- Maintain consistency throughout the conversation

**重要: 言語優先のレスポンスポリシー**

開発者とのやり取りでは:
- **ユーザーのリクエストと同じ言語で返答する**
- ユーザーが日本語で質問 → 日本語で返答
- ユーザーが英語で質問 → 英語で返答
- 会話全体を通じて一貫性を保つ

---

## 🎯 Monorepo Overview

このリポジトリは **モノレポ構造** を採用しており、以下の2つの主要サービスを含んでいます。

### Repository Structure

```
restexec/                          # モノレポルート
├── services/                      # サービスディレクトリ
│   ├── restexec/                  # REST API経由でTypeScriptコードを実行 (Deno)
│   │   ├── src/
│   │   ├── tests/
│   │   ├── specs/
│   │   └── CLAUDE.md
│   └── mcp-gateway/               # MCPサーバーへのHTTPゲートウェイ (Go)
│       ├── cmd/
│       ├── internal/
│       ├── specs/
│       └── CLAUDE.md
├── .github/                       # CI/CD configuration
├── .claude/                       # Claude Code configuration
├── compose.yaml                   # Docker Compose (全サービス)
├── CLAUDE.md                      # 人間/Claude向けガイド
└── AGENTS.md                      # このファイル (AIエージェント向け統合ガイド)
```

---

## 🛠️ Service 1: restexec (TypeScript Code Execution)

**概要**: REST API 経由で TypeScript コードを安全に実行するサービス。Deno の sandboxed runtime を使用。

### Technology Stack
- **Runtime**: Deno 2.5.6
- **Language**: TypeScript (strict mode)
- **Web Framework**: Oak v17.1.6
- **Container**: Alpine Linux + Docker

### 🔑 Key Points for AI Assistants
1. **実行モデル**: `/workspace/*.ts` はモジュールではなくスクリプトとして実行される。
2. **出力要件**: 結果は必ず `console.log(JSON.stringify(result))` で標準出力に出力する。
3. **セキュリティ**: Read 権限は `/workspace`, `/tools` のみ。Write/Network/Subprocess はデフォルト禁止。
4. **テンプレート**: 以下のテンプレートを常に使用すること。

### Quick Reference: Workspace Code Template
```typescript
async function main() {
  const result = {
    message: "Processing complete",
    status: "success"
  };

  // REQUIRED: Output as JSON
  console.log(JSON.stringify(result));
}

// REQUIRED: Execute with error handling
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### Development Commands
```bash
cd services/restexec
deno lint src/ tests/       # Lint
deno fmt --check src/ tests/ # Format Check
deno task test              # Run Tests
```

**詳細ドキュメント**: [`services/restexec/CLAUDE.md`](services/restexec/CLAUDE.md)

---

## 🛠️ Service 2: mcp-gateway (MCP Gateway Service)

**概要**: Model Context Protocol (MCP) サーバーへの HTTP アクセスを提供するゲートウェイサービス。

### Technology Stack
- **Language**: Go 1.21+
- **Web Framework**: Gin
- **MCP SDK**: github.com/modelcontextprotocol/go-sdk
- **Validation**: go-playground/validator

### 🔑 Key Points for AI Assistants
1. **設定ファイル**: `config/config.yaml` (YAML形式)。各サーバーに一意の名前が必要。
2. **コマンド**: 絶対パスまたは PATH 内のコマンドを指定。
3. **API**: `/mcp/call` (POST) でツール実行、`/mcp/tools` (GET) でツール一覧取得。

### Quick Reference: Configuration (config.yaml)
```yaml
servers:
  - name: health-server           # サーバー名（一意）
    command: /path/to/server      # 実行コマンド
    args:                         # 引数（オプション）
      - --port
      - "8080"
    env:                          # 環境変数（オプション）
      API_KEY: "your-api-key"
```

### Development Commands
```bash
cd services/mcp-gateway
go fmt ./...                # Format
golangci-lint run           # Lint
go test ./...               # Run Tests
```

**詳細ドキュメント**: [`services/mcp-gateway/CLAUDE.md`](services/mcp-gateway/CLAUDE.md)

---

## 📋 Development Workflow

### Before Committing
コミット前に、変更したサービスのテストとLint/Formatチェックを必ず実行してください。

### Commit Message Convention
[Conventional Commits](https://www.conventionalcommits.org/) に従ってください。
- `feat(restexec): ...`
- `fix(mcp-gateway): ...`
- `docs: ...`

### Docker Compose
全サービスの起動:
```bash
docker compose up -d
```
- restexec: `http://localhost:3000`
- mcp-gateway: `http://localhost:3001`

---

## 📚 Documentation Map

- **Monorepo Root**:
    - [`README.md`](README.md): プロジェクト概要
    - [`CLAUDE.md`](CLAUDE.md): Claude向けモノレポガイド
    - [`AGENTS.md`](AGENTS.md): このファイル (AIエージェント向け統合ガイド)
    - [`compose.yaml`](compose.yaml): Docker Compose 設定
- **restexec**:
    - [`services/restexec/specs/`](services/restexec/specs/): 詳細仕様書
    - [`services/restexec/CLAUDE.md`](services/restexec/CLAUDE.md): 開発ガイド
- **mcp-gateway**:
    - [`services/mcp-gateway/specs/`](services/mcp-gateway/specs/): 詳細仕様書
    - [`services/mcp-gateway/CLAUDE.md`](services/mcp-gateway/CLAUDE.md): 開発ガイド

---
*Last updated: 2025-11-30*
