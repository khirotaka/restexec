# 環境変数

## サーバー設定

| 変数名 | デフォルト値 | 説明 |
|-------|-----------|------|
| `PORT` | 3000 | HTTPサーバーのリスニングポート |
| `LOG_LEVEL` | info | ログレベル (DEBUG, INFO, WARN, ERROR) |
| `LOG_INCLUDE_STACK` | false | エラーログにスタックトレースを含めるか (true/false)。LOG_LEVEL=debugの場合は自動的に有効 |

## 実行設定

| 変数名 | デフォルト値 | 説明 |
|-------|-----------|------|
| `DEFAULT_TIMEOUT` | 5000 | デフォルトタイムアウト（ミリ秒） |
| `MAX_TIMEOUT` | 300000 | 最大タイムアウト（ミリ秒） |
| `WORKSPACE_DIR` | /workspace | コード実行ディレクトリ |
| `TOOLS_DIR` | /tools | 共有ツールディレクトリ |

## Deno 設定

| 変数名 | デフォルト値 | 説明 |
|-------|-----------|------|
| `DENO_PATH` | deno | Deno実行ファイルのパス |
| `DENO_IMPORT_MAP` | /workspace/import_map.json | インポートマップファイルのパス |

## Deno パーミッション設定

| 変数名 | デフォルト値 | 説明 |
|-------|-----------|------|
| `DENO_ALLOW_READ` | /workspace,/tools | 読み取り許可パス（カンマ区切り） |
| `DENO_ALLOW_WRITE` | (空) | 書き込み許可パス（カンマ区切り） |
| `DENO_ALLOW_NET` | (空) | ネットワークアクセス許可（カンマ区切り、例: api.example.com） |
| `DENO_ALLOW_RUN` | (空) | サブプロセス実行許可（カンマ区切り、例: git,npm） |

## 実行時環境変数（リクエストごとに指定可能）

POST /execute のリクエストボディで `env` パラメータを使用することで、実行コード内で使用する環境変数を指定できます。

### 使用例

```json
{
  "codeId": "example-code",
  "timeout": 5000,
  "env": {
    "API_KEY": "your-api-key",
    "DEBUG_MODE": "true",
    "USER_ID": "12345"
  }
}
```

### バリデーション制約

| 項目 | 制約 | 説明 |
|------|------|------|
| **キー形式** | `/^[A-Z0-9_]+$/` | 大文字英数字とアンダースコアのみ |
| **値の型** | 文字列のみ | すべての値は文字列として扱われる |
| **値の最大長** | 1000文字 | 個々の値の最大長 |
| **最大個数** | 50個 | 1リクエストあたりの環境変数の最大数 |
| **全体サイズ** | 10KB | すべてのキーと値の合計バイト数 |

### 禁止されたキー

セキュリティ上の理由から、以下の環境変数名は使用できません：

- **システム変数**: `PATH`, `DENO_DIR`, `HOME`, `USER`, `PWD`, `SHELL`, `HOSTNAME`, `TMPDIR`, `TEMP`, `TMP`
- **Denoプレフィックス**: `DENO_` で始まるすべての変数

### コード内での使用方法

```typescript
// 環境変数の取得
const apiKey = Deno.env.get('API_KEY');
const debugMode = Deno.env.get('DEBUG_MODE');

console.log(JSON.stringify({
  success: true,
  apiKey: apiKey,
  debugEnabled: debugMode === 'true',
}));
```

### セキュリティ考慮事項

- 環境変数は実行プロセスごとに独立しており、他のリクエストに影響しません
- 環境変数の値はログに記録されません（機密情報保護）
- プロセス終了とともに環境変数は破棄されます
