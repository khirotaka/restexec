# CLAUDE.md - AI Assistant Guide

このドキュメントは、AI アシスタント（Claude, Gemini など）がこの **モノレポプロジェクト** を効率的にナビゲートするのを支援します。

---

## 🌐 Language Preference / 言語優先設定

**IMPORTANT: Language-First Response Policy**

When interacting with developers:
- **Respond in the same language as the user's request**
- If the user asks in Japanese → Respond in Japanese (日本語で返答)
- If the user asks in English → Respond in English
- Maintain consistency throughout the conversation

This allows developers to interact with Claude in their preferred language for better onboarding and collaboration.

**重要: 言語優先のレスポンスポリシー**

開発者とのやり取りでは:
- **ユーザーのリクエストと同じ言語で返答する**
- ユーザーが日本語で質問 → 日本語で返答
- ユーザーが英語で質問 → 英語で返答
- 会話全体を通じて一貫性を保つ

これにより、開発者は好みの言語で Claude とやり取りでき、より良いオンボーディングとコラボレーションが可能になります。

---

## 📖 Purpose of This Document

**これはナビゲーションガイドです。**

このドキュメントは、モノレポ全体の構造を理解し、各サービスの開発を始めるための出発点を提供します。各サービス固有の詳細情報については、サービスごとの CLAUDE.md を参照してください。

---

## 🎯 Monorepo Overview

このリポジトリは **モノレポ構造** を採用しており、複数の関連サービスを含んでいます。

### Repository Structure

```
restexec/                          # モノレポルート
├── services/                      # サービスディレクトリ
│   ├── restexec/                  # REST API経由でTypeScriptコードを実行
│   │   ├── src/
│   │   ├── tests/
│   │   ├── specs/
│   │   ├── CLAUDE.md              # restexec 開発ガイド ⭐
│   │   └── README.md
│   └── mcp-gateway/               # MCPサーバーへのHTTPゲートウェイ
│       ├── cmd/
│       ├── internal/
│       ├── specs/
│       ├── CLAUDE.md              # mcp-gateway 開発ガイド ⭐
│       └── README.md
├── .github/                       # CI/CD configuration
│   └── workflows/
│       ├── claude-code-review.yml # Claude Code Review
│       └── claude.yml             # Claude Code Integration
├── .claude/                       # Claude Code configuration
│   └── agents/                    # Sub-agents
│       ├── doc-sync-checker.md
│       └── security-auditor.md
├── compose.yaml                   # Docker Compose (全サービス)
├── CLAUDE.md                      # このファイル（モノレポガイド）
├── AGENTS.md                      # 他のAIエージェント向け統合ガイド
└── README.md                      # プロジェクト概要
```

### Services

#### 1. **restexec** - TypeScript Code Execution Service

REST API 経由で TypeScript コードを安全に実行するサービス。Deno の sandboxed runtime を使用。

**技術スタック**: Deno, TypeScript, Oak Framework

**開発を始める**: [`services/restexec/CLAUDE.md`](services/restexec/CLAUDE.md) ⭐

**詳細**: [`services/restexec/README.md`](services/restexec/README.md)

#### 2. **mcp-gateway** - MCP Gateway Service

Model Context Protocol (MCP) サーバーへの HTTP アクセスを提供するゲートウェイサービス。

**技術スタック**: Go, Gin, MCP SDK

**開発を始める**: [`services/mcp-gateway/CLAUDE.md`](services/mcp-gateway/CLAUDE.md) ⭐

**詳細**: [`services/mcp-gateway/README.md`](services/mcp-gateway/README.md)

---

## 🚀 Getting Started

### モノレポでの開発を始める

1. **リポジトリをクローン**:
   ```bash
   git clone <repository-url>
   cd restexec
   ```

2. **開発したいサービスを選択**:
   - **restexec を開発する**: [`services/restexec/CLAUDE.md`](services/restexec/CLAUDE.md) を参照
   - **mcp-gateway を開発する**: [`services/mcp-gateway/CLAUDE.md`](services/mcp-gateway/CLAUDE.md) を参照

3. **Docker Compose で全サービスを起動**:
   ```bash
   docker compose up -d
   ```
   
   - restexec: `http://localhost:3000`
   - mcp-gateway: `http://localhost:3001`

### 特定のサービスのみを起動

```bash
# restexec のみ
docker compose up -d restexec

# mcp-gateway のみ
docker compose up -d mcp-gateway
```

---

## 🤖 Claude Code Sub-Agents

このプロジェクトには、特定のタスクを積極的に支援する専門化されたサブエージェントが含まれています。

### Available Sub-Agents

#### 1. **doc-sync-checker** - Documentation Synchronization Checker

**目的**: コード変更時に仕様書ドキュメントの更新漏れを検出

**自動トリガー**:
- API 変更（`routes/`）
- バリデーション変更（`middleware/validation.ts`）
- コアロジック変更（`utils/`）

**手動起動**:
```
doc-sync-checker エージェントで最近の変更を確認して
```

**実行内容**:
- `git diff` を分析して変更ファイルを特定
- 関連する仕様書（`specs/API.md`, `specs/Security.md` など）とのマッピング
- コードとドキュメントの不整合を検出
- 具体的な更新提案を行番号付きで提供
- 優先度付け（Critical/Medium/Low）

#### 2. **security-auditor** - Security Audit Agent

**目的**: セキュリティリスクを積極的に監視・検出

**自動トリガー**:
- Dockerfile または compose.yaml の変更
- 実行ロジックの変更（`executor.ts`, `main.go`）
- 依存関係の追加・更新（`deps.ts`, `go.mod`）
- 設定ファイルの変更（`config.ts`, `config.yaml`）

**手動起動**:
```
security-auditor エージェントでセキュリティ監査をして
```

**実行内容**:
- パーミッション設定の変更監視（`--allow-*` フラグ）
- OWASP Top 10 脆弱性スキャン
- 依存関係のセキュリティチェック
- 実行制限の検証（timeout, buffer size など）
- CVSS ベースのリスクスコア提供

### Sub-Agents の動作

**自動起動**:
- Claude Code がタスクとファイル変更に基づいて適切なエージェントを自動選択
- 説明に `PROACTIVELY` を含むエージェントは明示的なリクエストなしで呼び出される

**手動起動**:
- リクエストにエージェント名を含める
- 例: "security-auditor エージェントを実行して"

**エージェント設定**:
- 定義場所: `.claude/agents/` ディレクトリ
- 動作をカスタマイズする場合は、Markdown ファイル（YAML frontmatter + system prompt）を編集

---

## 🔄 CI/CD Integration

### Claude Code in GitHub Actions

このリポジトリでは、GitHub Actions で Claude Code を活用しています。

#### 1. **Claude Code Review** (`.github/workflows/claude-code-review.yml`)

プルリクエストが作成・更新されたときに自動的にコードレビューを実施します。

**実行タイミング**:
- PR が opened, synchronized, ready_for_review, reopened

**レビュー観点**:
- 保守性と可読性
- 設計とアーキテクチャの妥当性
- コード品質とベストプラクティス
- 潜在的なバグや問題
- セキュリティ上の懸念点

**フィードバック形式**:
- インラインコメント（改善点・懸念事項のみ）
- 結論を先に述べ、理由と具体的な修正案を提示
- すべて日本語で記述

#### 2. **Claude Code** (`.github/workflows/claude.yml`)

Issue や PR のコメントで `@claude` をメンションすると、Claude が支援します。

**トリガー**:
- Issue コメントに `@claude` を含む
- PR レビューコメントに `@claude` を含む
- Issue タイトルまたは本文に `@claude` を含む

**このCLAUDE.mdの役割**:
- CI ワークフローで実行される Claude は、このファイルを参照してリポジトリ構造を理解
- 各サービスの CLAUDE.md へのポインタとして機能
- モノレポ全体の開発ワークフローを提供

---

## 📋 Development Workflow

### Before Committing

コミット前に実施すべきチェック項目：

#### For restexec service:

```bash
cd services/restexec

# Lint code
deno lint src/ tests/

# Check formatting
deno fmt --check src/ tests/

# Run all tests
deno task test
```

#### For mcp-gateway service:

```bash
cd services/mcp-gateway

# Format code
go fmt ./...

# Lint
golangci-lint run

# Run all tests
go test ./...
```

### For New Features

1. **仕様書を読む**: 該当サービスの `specs/` ディレクトリを確認
2. **仕様書を更新**: 必要に応じて仕様書を更新
3. **実装**: エラーハンドリングを含めて実装
4. **テストを追加**: 包括的なテストを作成
5. **ドキュメント更新**: 
   - サービスの CLAUDE.md を更新（ユーザー向け情報の場合）
   - サービスの README.md を更新（必要に応じて）
6. **doc-sync-checker を実行**: ドキュメントの同期を確認

### For Bug Fixes

1. **根本原因を特定**
2. **バグを再現するテストを追加**
3. **最小限の修正を実装**
4. **すべてのテストが通ることを確認**
5. **トラブルシューティングセクションを更新**（広く適用可能な場合）

### Commit Message Convention

[Conventional Commits](https://www.conventionalcommits.org/) に従ってください：

- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメントのみの変更
- `test:` - テストの追加・修正
- `refactor:` - リファクタリング
- `chore:` - ビルドプロセスやツールの変更

**例**:
```bash
git commit -m "feat(restexec): add environment variable validation"
git commit -m "fix(mcp-gateway): handle MCP server crash correctly"
git commit -m "docs: update CLAUDE.md for monorepo structure"
```

---

## 🔑 Key Points for AI Assistants

### When User Asks About...

- **「restexec の開発を始めたい」** → [`services/restexec/CLAUDE.md`](services/restexec/CLAUDE.md) を参照するように案内
- **「mcp-gateway の開発を始めたい」** → [`services/mcp-gateway/CLAUDE.md`](services/mcp-gateway/CLAUDE.md) を参照するように案内
- **「モノレポ全体の構造を知りたい」** → このドキュメントの [Monorepo Overview](#-monorepo-overview) を参照
- **「CI/CD について」** → [CI/CD Integration](#-cicd-integration) を参照
- **「コミット前にやることは？」** → [Development Workflow](#-development-workflow) を参照

### Working with Multiple Services

このモノレポで作業する際の注意点：

1. **作業ディレクトリを意識する**: 各サービスは独立したディレクトリ構造を持つ
2. **サービス固有のツールを使用**: 
   - restexec: Deno コマンド
   - mcp-gateway: Go コマンド
3. **依存関係は別々に管理**: 
   - restexec: `deps.ts`
   - mcp-gateway: `go.mod`
4. **ドキュメントは各サービス内を確認**: `services/<service>/specs/`

### Navigation Tips

- **トップレベルのこのファイル**: モノレポ全体の構造、CI/CD、開発ワークフロー
- **サービスの CLAUDE.md**: サービス固有の開発ガイド、API リファレンス、トラブルシューティング
- **サービスの README.md**: サービスの概要、クイックスタート
- **サービスの specs/**: 詳細な仕様書

---

## 🛠️ Technology Stack

### Monorepo Tools
- **Docker Compose**: マルチサービスオーケストレーション
- **Git**: バージョン管理

### Service-Specific Technologies

**restexec**:
- Runtime: Deno 2.5.6
- Language: TypeScript (strict mode)
- Web Framework: Oak v17.1.6
- Container: Alpine Linux + Docker

**mcp-gateway**:
- Language: Go 1.21+
- Web Framework: Gin
- MCP SDK: github.com/modelcontextprotocol/go-sdk
- Validation: go-playground/validator

---

## 📚 Documentation Map

### Monorepo-Level Documentation

- [README.md](README.md) - プロジェクト概要とクイックスタート
- [CLAUDE.md](CLAUDE.md) - このファイル（AI アシスタント向けガイド）
- [AGENTS.md](AGENTS.md) - 他のAIエージェント向け統合ガイド
- [compose.yaml](compose.yaml) - Docker Compose 設定
- [.github/workflows/](.github/workflows/) - CI/CD ワークフロー

### Service-Level Documentation

**restexec**:
- **開発ガイド**: [services/restexec/CLAUDE.md](services/restexec/CLAUDE.md) ⭐
- **README**: [services/restexec/README.md](services/restexec/README.md)
- **仕様書**: [services/restexec/specs/](services/restexec/specs/)

**mcp-gateway**:
- **開発ガイド**: [services/mcp-gateway/CLAUDE.md](services/mcp-gateway/CLAUDE.md) ⭐
- **README**: [services/mcp-gateway/README.md](services/mcp-gateway/README.md)
- **仕様書**: [services/mcp-gateway/specs/](services/mcp-gateway/specs/)

---

## 🆘 Getting Help

### For Service-Specific Issues

各サービスのトラブルシューティングセクションを参照：
- restexec: [services/restexec/CLAUDE.md](services/restexec/CLAUDE.md)
- mcp-gateway: [services/mcp-gateway/CLAUDE.md](services/mcp-gateway/CLAUDE.md)

### For Monorepo-Level Issues

1. Docker Compose の問題: `docker compose logs` でログを確認
2. ポート競合: `lsof -i :3000` または `lsof -i :3001` で確認
3. サービス間の連携問題: `compose.yaml` のネットワーク設定を確認

### For CI/CD Issues

1. GitHub Actions のログを確認
2. Claude Code のフィードバックを確認
3. ワークフローファイル（`.github/workflows/`）を確認

---

*このドキュメントはモノレポ全体のナビゲーションガイドです。各サービスの詳細情報は、サービスごとの CLAUDE.md を参照してください。*

*Last updated: 2025-11-30*
