# 環境変数

## サーバー設定

| 変数名 | デフォルト値 | 説明 |
|-------|-----------|------|
| `PORT` | 3000 | HTTPサーバーのリスニングポート |
| `LOG_LEVEL` | info | ログレベル (DEBUG, INFO, WARN, ERROR) |

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
