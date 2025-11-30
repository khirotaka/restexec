# CLAUDE.md - restexec Development Guide

このドキュメントは、**restexec サービス**の開発を支援します。

restexec は、REST API 経由で TypeScript コードを安全に実行するサービスです。Deno の sandboxed runtime を使用して、ファイルシステム、ネットワーク、プロセス実行を細かく制御します。

---

## 🌐 Language Preference / 言語優先設定

**IMPORTANT: Language-First Response Policy**

- **Respond in the same language as the user's request**
- ユーザーが日本語で質問 → 日本語で返答
- ユーザーが英語で質問 → 英語で返答

---

## 📖 Purpose of This Document

このドキュメントは restexec サービスの開発時に参照する **クイックリファレンスとナビゲーションガイド** です。

詳細な仕様については、常に `specs/` ディレクトリ内のドキュメントを参照してください。このドキュメントは以下を提供します：

- **クイックサマリー** - コアコンセプトの要約
- **最小限のテンプレート** - 一般的なタスクのテンプレート
- **ポインタ** - 詳細ドキュメントへのリンク
- **トラブルシューティング** - よくある問題と解決方法

---

## 🎯 restexec Overview

### Three Core Concepts

1. **実行モデル**: `/workspace/*.ts` のコードファイルは **スクリプト** として実行（モジュールではない）
   - 結果は stdout に出力: `console.log(JSON.stringify(result))`
   - 各実行は独立した Deno 子プロセスで実行

2. **3つの API エンドポイント**:
   - `PUT /workspace` - TypeScript コードを保存
   - `POST /lint` - `deno lint` でコード品質をチェック
   - `POST /execute` - コードを実行して結果を返す

3. **セキュリティファースト設計**: Deno の明示的なパーミッションシステム
   - Read: `/workspace`, `/tools` のみ
   - Write/Network/Subprocess: デフォルトで無効
   - Timeout: 5 秒（最大 300 秒）

### Key Features

- **Secure sandboxing** - Deno のパーミッションシステム
- **External library support** - 事前キャッシュされた依存関係（`deps.ts`）
- **Markdown code extraction** - LLM 生成レスポンス対応
- **Resource limits** - タイムアウト、バッファサイズ、ファイルサイズ

### Target Use Cases

- コード教育プラットフォーム
- API 自動化とワークフロー
- 分離されたデータ処理
- 信頼できないコードのテスト
- LLM 駆動のコード生成・実行

**完全な詳細**: [README.md](README.md), [specs/API.md](specs/API.md)

---

## 🚀 Quick Reference by Task

### Task: Write Workspace Code

**最小限のテンプレート** (async function):

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

**重要な要件**:
1. ✅ `console.log(JSON.stringify(result))` で出力
2. ✅ main 関数を呼び出す（定義だけでなく）
3. ✅ `.catch()` と `Deno.exit(1)` でエラーハンドリング
4. ❌ `export default` や `return` 値は使わない
5. ❌ `process.exit()` は使わない（Node.js API）

**外部ユーティリティの使用**:

```typescript
import { add } from 'utils/math.ts';
import { capitalize } from 'utils/string.ts';

async function main() {
  const result = {
    sum: add(10, 20),
    text: capitalize('hello'),
    status: 'success'
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  Deno.exit(1);
});
```

**環境変数の使用**:

```typescript
async function main() {
  // Get environment variables
  const apiKey = Deno.env.get('API_KEY');
  const debugMode = Deno.env.get('DEBUG_MODE');

  const result = {
    apiKey: apiKey,
    debugEnabled: debugMode === 'true',
    status: 'success'
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  Deno.exit(1);
});
```

**API リクエストで環境変数を渡す**:
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "codeId":"my-script",
    "env": {
      "API_KEY": "secret-123",
      "DEBUG_MODE": "true"
    }
  }'
```

**環境変数の制約**:
- **キー形式**: 大文字、数字、アンダースコアのみ (`/^[A-Z0-9_]+$/`)
- **最大数**: 50 個
- **最大サイズ**: 10KB（すべてのキーと値の合計）
- **禁止キー**: `PATH`, `DENO_DIR`, `HOME`, `USER`, `PWD`, `SHELL`, `HOSTNAME`, `TMPDIR`, `TEMP`, `TMP`, `DENO_*`

**セキュリティ制約**:
- ✅ `/workspace` と `/tools` から読み取り可能
- ❌ write, network, subprocess アクセスなし（デフォルト）
- ⏱️ デフォルトタイムアウト: 5 秒
- 🔐 環境変数はプロセス分離され、一時的

**完全ガイド**: [docs/workspace-code-guide.md](docs/workspace-code-guide.md)

---

### Task: Add External Libraries

**4ステッププロセス**:

1. **`deps.ts` に追加** - 正確なバージョンを指定:
   ```typescript
   // deps.ts
   export * from "https://esm.sh/es-toolkit@1.27.0";
   export * from "https://esm.sh/date-fns@3.0.0";
   ```

2. **`import_map.json` を更新** (オプション、利便性のため):
   ```json
   {
     "imports": {
       "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
       "date-fns": "https://esm.sh/date-fns@3.0.0"
     }
   }
   ```

3. **コンテナを再ビルド**:
   ```bash
   docker compose build restexec
   ```

4. **コンテナを再起動**:
   ```bash
   docker compose up -d restexec
   ```

**理由**: 実行時に `--cached-only` フラグを使用。すべてのライブラリはビルド時にキャッシュ必須。

**推奨ライブラリ**: es-toolkit, date-fns, zod, lodash-es, mathjs

**完全ガイド**: [specs/Libraries.md](specs/Libraries.md)

---

### Task: Understand the API

**PUT /workspace** - コードを保存:
```json
// Request
{"codeId": "my-script", "code": "console.log(JSON.stringify({msg: 'hi'}));"}

// Response
{"success": true, "result": {"codeId": "my-script", "filePath": "/workspace/my-script.ts", "size": 56}}
```

**POST /lint** - コード品質をチェック:
```json
// Request
{"codeId": "my-script", "timeout": 5000}

// Response
{"success": true, "result": {"diagnostics": [...], "errors": [], "checkedFiles": [...]}}
```

**POST /execute** - コードを実行:
```json
// Request
{"codeId": "my-script", "timeout": 5000}

// Response
{"success": true, "result": {/* your code's output */}, "executionTime": 234}
```

**GET /health** - サーバーステータス:
```json
{"status": "ok", "uptime": 12345, "memoryUsage": {...}}
```

**典型的なワークフロー**:
```
PUT /workspace → (POST /lint) → POST /execute
```

**完全な仕様**: [specs/API.md](specs/API.md), [specs/LintAPI.md](specs/LintAPI.md), [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md)

---

### Task: Run Tests

**基本コマンド**:
```bash
deno task test
```

**⚠️ ローカル開発での重要な注意**:

テストは `/workspace` ディレクトリに書き込みます。これが失敗する場合：

**解決策 1**: `/workspace` を適切な権限で作成:
```bash
sudo mkdir -p /workspace
sudo chmod 777 /workspace
deno task test
```

**解決策 2**: 一時ディレクトリを使用（ローカル開発推奨）:
```bash
mkdir -p /tmp/restexec-workspace
WORKSPACE_DIR=/tmp/restexec-workspace deno task test
```

**なぜこれが起こるか**:
- 統合テストは `config.workspaceDir` にファイルを保存（デフォルト: `/workspace`）
- ローカルマシンには `/workspace` がないか、書き込み権限がない可能性
- Docker コンテナにはこのディレクトリが事前設定済み

**特定のテストファイルを実行**:
```bash
deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/workspace.test.ts
```

**完全ガイド**: [specs/Test.md](specs/Test.md)

---

## 🔧 Troubleshooting

### Problem: コード実行で `null` が返る

**症状**: コードは実行されるが `result` フィールドが `null`

**よくある原因**:
1. `console.log(JSON.stringify(result))` が欠けている
2. 関数は定義されているが呼び出されていない
3. `return` を使用（`console.log` の代わりに）

**解決策**: [Write Workspace Code](#task-write-workspace-code) のテンプレートを使用

---

### Problem: "Module not found" エラー

**症状**: 外部ライブラリのインポートでエラー

**よくある原因**:
1. ライブラリが `deps.ts` にない
2. コンテナを再ビルドしていない
3. インポートパスが間違っている

**解決策**:
```bash
# 1. deps.ts に追加
# 2. 再ビルド
docker compose build restexec
# 3. 再起動
docker compose up -d restexec
```

---

### Problem: タイムアウトエラー

**症状**: `TimeoutError: Execution timed out after Xms`

**よくある原因**: 無限ループ、長時間の操作、タイムアウトが短すぎる

**解決策**:
1. コードに無限ループがないか確認
2. タイムアウトを増やす: `{"timeout": 30000}`
3. 非同期操作を最適化

---

### Problem: パーミッション拒否エラー

**症状**: パーミッション不足に関するエラー（read/write/net）

**よくある原因**: コードが禁止されたリソースにアクセスしている

**解決策**:
1. 上記の [Security Model](#-restexec-overview) を確認
2. コードが `/workspace` と `/tools` のみにアクセスすることを確認
3. 必要に応じて環境変数経由でパーミッションを設定

**詳細**: [specs/Security.md](specs/Security.md)

---

### Problem: ファイルが見つからない (404)

**症状**: `FileNotFoundError: Code file not found`

**よくある原因**: ファイルが保存されていない、codeId が間違っている

**解決策**:
```bash
# 1. まず保存
curl -X PUT http://localhost:3000/workspace \
  -H "Content-Type: application/json" \
  -d '{"codeId":"my-script","code":"..."}'

# 2. その後実行（同じ codeId を使用、.ts 拡張子なし）
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId":"my-script"}'
```

---

### Problem: `deno task test` の失敗

**症状**: "Permission denied" や "No such file or directory" のようなテストエラー

**よくある原因**:
- `/workspace` ディレクトリが存在しない
- `/workspace` への書き込み権限がない
- ローカルマシンでテストを実行している（Docker 内ではない）

**解決策** (いずれかを選択):

**Option 1** - `/workspace` ディレクトリを作成:
```bash
sudo mkdir -p /workspace
sudo chmod 777 /workspace
deno task test
```

**Option 2** - 一時ディレクトリを使用（推奨）:
```bash
# WORKSPACE_DIR を書き込み可能な場所に設定
mkdir -p /tmp/restexec-workspace
WORKSPACE_DIR=/tmp/restexec-workspace deno task test
```

**Option 3** - Docker でテストを実行:
```bash
docker compose run --rm restexec deno task test
```

**環境変数**:
```bash
# テスト用のワークスペースディレクトリを上書き
export WORKSPACE_DIR=/tmp/restexec-workspace
export TOOLS_DIR=/tmp/restexec-tools

# その後テストを実行
deno task test
```

---

### Problem: コンテナが起動しない

**症状**: Docker コンテナが終了または起動しない

**よくある原因**: ポート使用中、ビルドエラー、設定問題

**解決策**:
```bash
# 1. ログを確認
docker compose logs restexec

# 2. ポート 3000 が利用可能か確認
lsof -i :3000

# 3. ゼロから再ビルド
docker compose build --no-cache restexec

# 4. 環境変数を確認
cat compose.yaml
```

---

## 📚 Documentation Map

### Essential Documentation

**開発用**:
- [docs/workspace-code-guide.md](docs/workspace-code-guide.md) - ワークスペースコード作成の完全ガイド
- [specs/Security.md](specs/Security.md) - セキュリティモデルとパーミッション
- [specs/Libraries.md](specs/Libraries.md) - 外部ライブラリ管理

**API 仕様**:
- [specs/API.md](specs/API.md) - POST /execute エンドポイント
- [specs/LintAPI.md](specs/LintAPI.md) - POST /lint エンドポイント
- [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md) - PUT /workspace エンドポイント

**アーキテクチャ**:
- [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - システム設計
- [specs/Sequence.md](specs/Sequence.md) - 実行フロー図
- [specs/CodeExecution.md](specs/CodeExecution.md) - 実行の詳細

**運用**:
- [README.md](README.md) - クイックスタートガイド
- [DOCKER.md](DOCKER.md) - Docker セットアップ
- [specs/Deployment.md](specs/Deployment.md) - デプロイメントガイド
- [specs/Configuration.md](specs/Configuration.md) - 環境変数
- [specs/Test.md](specs/Test.md) - テスト戦略

**その他の仕様**:
- [specs/FileSystem.md](specs/FileSystem.md) - ファイルシステム構造
- [specs/Logging.md](specs/Logging.md) - ロギング設定
- [specs/Performance.md](specs/Performance.md) - パフォーマンスベンチマーク
- [specs/Regulation.md](specs/Regulation.md) - 実行規制

### Working Examples

**コード例**:
- [example/workspace/hello-world.ts](example/workspace/hello-world.ts) - シンプルな例
- [example/workspace/with-import.ts](example/workspace/with-import.ts) - インポートの例
- [example/workspace/async-example.ts](example/workspace/async-example.ts) - 非同期の例

**ユーティリティ例**:
- [example/tools/utils/math.ts](example/tools/utils/math.ts) - 数学ユーティリティ
- [example/tools/utils/string.ts](example/tools/utils/string.ts) - 文字列ユーティリティ

---

## 🔑 Key Points for AI Assistants

### When Writing Workspace Code

1. **常にテンプレートを使用**
2. **常に `console.log(JSON.stringify(result))` で出力**
3. **常に関数を呼び出す**（定義だけでなく）
4. **決して使わない**: `export default` や Node.js API

### When User Asks About...

- **「コードの書き方は？」** → テンプレート + [docs/workspace-code-guide.md](docs/workspace-code-guide.md) へのリンク
- **「ライブラリの追加方法は？」** → 4 ステッププロセス + [specs/Libraries.md](specs/Libraries.md) へのリンク
- **「使える API は？」** → クイックリファレンス + [specs/API.md](specs/API.md) へのリンク
- **「コードが動かない」** → [Troubleshooting](#-troubleshooting) セクションを確認
- **「テストの実行方法は？」** → [Task: Run Tests](#task-run-tests) セクションを参照

### Architecture Questions

詳細なアーキテクチャの質問については、以下を読む：
1. [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - ハイレベル設計
2. [specs/Sequence.md](specs/Sequence.md) - 実行フロー
3. [specs/Security.md](specs/Security.md) - セキュリティモデル
4. `src/` 内の関連ソースファイル

---

## 🛠️ Technology Stack

- **Runtime**: Deno 2.5.6
- **Language**: TypeScript (strict mode)
- **Web Framework**: Oak v17.1.6
- **Container**: Alpine Linux + Docker
- **Testing**: Deno's built-in test runner
- **External Libraries**: `deps.ts` + esm.sh CDN で管理

---

## 📋 Development Workflow

### Before Committing

変更をコミットする前にこれらのチェックを実施：
```bash
# Lint code
deno lint src/ tests/

# Check formatting
deno fmt --check src/ tests/

# Run all tests
deno task test
```

すべてのチェックがエラーや警告なしでパスする必要があります。

**フォーマット問題の自動修正**:
```bash
deno fmt src/ tests/
```

### For New Features

1. `specs/` 内の関連仕様を読む
2. 必要に応じて仕様を更新
3. エラーハンドリングを含めて実装
4. 包括的なテストを追加
5. クイックリファレンスに影響する場合はこの CLAUDE.md を更新
6. ユーザー向けの場合は README.md を更新

### For Bug Fixes

1. 根本原因を特定
2. バグを再現するテストを追加
3. 最小限の修正を実装
4. すべてのテストがパスすることを確認
5. 広く適用可能な場合はトラブルシューティングセクションを更新

---

*このドキュメントはナビゲーションガイドです。完全な情報については、リンクされたドキュメントファイルを参照してください。*

*Last updated: 2025-11-30*
