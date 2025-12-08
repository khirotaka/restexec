# ファイルエクスプローラー API 仕様書

## 概要

ファイルエクスプローラー API は、`/workspace` および `/tools` ディレクトリ内のファイルを探索・検索するための REST エンドポイントを提供します。この API により、外部サービス(別の Pod で実行されている AI Agent など)が、ボリューム共有を必要とせずにファイルシステムをプログラマティックに探索し、ファイルの内容を読み取り、ファイル内のパターンを検索できます。

## 動機

Kubernetes へのデプロイ時、Pod 間でボリュームを共有するには複雑な設定と特定のストレージソリューション(NFS などを使用した ReadWriteMany PVC など)が必要です。ファイル操作を REST API 経由で公開することで、以下のメリットが得られます:

- AI Agent と restexec の Pod 間で共有ボリュームを必要としない
- AI Agent と restexec サービスの独立したスケーリングが可能
- あらゆる Kubernetes 環境で機能する一貫したインターフェースの提供
- API レイヤーでのセキュリティ制御の追加

## API エンドポイント

| メソッド | エンドポイント  | 説明                                                                   |
| -------- | --------------- | ---------------------------------------------------------------------- |
| `GET`    | `/files/list`   | オプションの glob パターンを使用してディレクトリ内のファイルを一覧表示 |
| `GET`    | `/files/read`   | ファイルの内容を読み取る                                               |
| `POST`   | `/files/search` | ファイル内のパターンを検索(grep 風の機能)                              |

---

## エンドポイント: GET /files/list

許可されたパス(`/workspace` または `/tools`)内のファイルとディレクトリを一覧表示します。

### リクエスト

**URL**: `http://localhost:3000/files/list`

**メソッド**: `GET`

**クエリパラメータ**:

| パラメータ      | 型      | 必須   | デフォルト | 説明                                                                                  |
| --------------- | ------- | ------ | ---------- | ------------------------------------------------------------------------------------- |
| `path`          | string  | ✅ Yes | -          | 一覧表示するベースディレクトリパス(`/workspace` または `/tools` 配下である必要がある) |
| `pattern`       | string  | ❌ No  | `*`        | ファイルをフィルタリングする glob パターン(例: `**/*.ts`, `*.json`)                   |
| `maxDepth`      | number  | ❌ No  | 10         | 探索する最大ディレクトリ深度(1-100)                                                   |
| `includeHidden` | boolean | ❌ No  | false      | 隠しファイル(`.` で始まるファイル)を含める                                            |

### 使用例

```bash
# /tools 内のすべてのファイルを一覧表示
curl "http://localhost:3000/files/list?path=/tools"

# TypeScript ファイルを再帰的に一覧表示
curl "http://localhost:3000/files/list?path=/tools&pattern=**/*.ts"

# 深度を制限してファイルを一覧表示
curl "http://localhost:3000/files/list?path=/workspace&maxDepth=2"
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "basePath": "/tools",
    "pattern": "**/*.ts",
    "files": [
      {
        "path": "/tools/mcp/client.ts",
        "relativePath": "mcp/client.ts",
        "name": "client.ts",
        "size": 1234,
        "isDirectory": false,
        "modifiedAt": "2025-12-07T10:00:00.000Z"
      },
      {
        "path": "/tools/mcp",
        "relativePath": "mcp",
        "name": "mcp",
        "size": 0,
        "isDirectory": true,
        "modifiedAt": "2025-12-07T09:00:00.000Z"
      }
    ],
    "totalCount": 15,
    "truncated": false
  },
  "executionTime": 42
}
```

#### レスポンスフィールド

| フィールド                    | 型      | 説明                                         |
| ----------------------------- | ------- | -------------------------------------------- |
| `result.basePath`             | string  | 一覧表示されたベースディレクトリ             |
| `result.pattern`              | string  | フィルタリングに使用された glob パターン     |
| `result.files`                | array   | ファイル/ディレクトリエントリの配列          |
| `result.files[].path`         | string  | ファイルへの絶対パス                         |
| `result.files[].relativePath` | string  | basePath からの相対パス                      |
| `result.files[].name`         | string  | ファイルまたはディレクトリ名                 |
| `result.files[].size`         | number  | ファイルサイズ(バイト単位、ディレクトリは 0) |
| `result.files[].isDirectory`  | boolean | エントリがディレクトリかどうか               |
| `result.files[].modifiedAt`   | string  | 最終更新日時(ISO 8601)                       |
| `result.totalCount`           | number  | マッチするエントリの総数                     |
| `result.truncated`            | boolean | 制限により結果が切り詰められたかどうか       |

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc/passwd",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 404 Not Found - ディレクトリが見つからない

```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "Directory not found",
    "details": {
      "path": "/tools/nonexistent"
    }
  },
  "executionTime": 1
}
```

---

## エンドポイント: GET /files/read

許可されたパス内のファイルの内容を読み取ります。

### リクエスト

**URL**: `http://localhost:3000/files/read`

**メソッド**: `GET`

**クエリパラメータ**:

| パラメータ | 型     | 必須   | デフォルト | 説明                                                                      |
| ---------- | ------ | ------ | ---------- | ------------------------------------------------------------------------- |
| `path`     | string | ✅ Yes | -          | 読み取るファイルのパス(`/workspace` または `/tools` 配下である必要がある) |
| `encoding` | string | ❌ No  | `utf-8`    | ファイルエンコーディング(`utf-8`, `base64`)                               |
| `maxSize`  | number | ❌ No  | 1048576    | 読み取る最大ファイルサイズ(バイト単位、最大: 10MB)                        |

### 使用例

```bash
# TypeScript ファイルを読み取る
curl "http://localhost:3000/files/read?path=/tools/mcp/client.ts"

# ファイルを base64 として読み取る(バイナリファイル用)
curl "http://localhost:3000/files/read?path=/workspace/data.bin&encoding=base64"
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "path": "/tools/mcp/client.ts",
    "content": "// MCP Client implementation\nexport class MCPClient {\n  ...\n}",
    "size": 1234,
    "encoding": "utf-8",
    "mimeType": "text/typescript",
    "modifiedAt": "2025-12-07T10:00:00.000Z"
  },
  "executionTime": 5
}
```

#### レスポンスフィールド

| フィールド          | 型     | 説明                                                          |
| ------------------- | ------ | ------------------------------------------------------------- |
| `result.path`       | string | ファイルへの絶対パス                                          |
| `result.content`    | string | ファイルの内容(UTF-8 テキストまたは base64 エンコード)        |
| `result.size`       | number | ファイルサイズ(バイト単位)                                    |
| `result.encoding`   | string | 使用されたコンテンツエンコーディング(`utf-8` または `base64`) |
| `result.mimeType`   | string | 検出されたファイルの MIME タイプ                              |
| `result.modifiedAt` | string | 最終更新日時(ISO 8601)                                        |

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc/passwd",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 404 Not Found - ファイルが見つからない

```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "File not found",
    "details": {
      "path": "/tools/nonexistent.ts"
    }
  },
  "executionTime": 1
}
```

#### 413 Payload Too Large - ファイルが大きすぎる

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "File size exceeds maximum allowed size",
    "details": {
      "path": "/workspace/large-file.ts",
      "size": 20971520,
      "maxSize": 10485760
    }
  },
  "executionTime": 2
}
```

---

## エンドポイント: POST /files/search

ファイル内のパターンを検索します(grep 風の機能)。

### リクエスト

**URL**: `http://localhost:3000/files/search`

**メソッド**: `POST`

**Content-Type**: `application/json`

**リクエストボディ**:

```json
{
  "path": "/tools",
  "pattern": "**/*.ts",
  "query": "export function",
  "isRegex": false,
  "caseInsensitive": true,
  "maxResults": 50,
  "contextLines": 0
}
```

#### パラメータ

| パラメータ        | 型      | 必須   | デフォルト | 説明                                       |
| ----------------- | ------- | ------ | ---------- | ------------------------------------------ |
| `path`            | string  | ✅ Yes | -          | 検索するベースディレクトリ                 |
| `query`           | string  | ✅ Yes | -          | 検索クエリ(プレーンテキストまたは正規表現) |
| `pattern`         | string  | ❌ No  | `**/*`     | ファイルをフィルタリングする glob パターン |
| `isRegex`         | boolean | ❌ No  | false      | クエリが正規表現パターンかどうか           |
| `caseInsensitive` | boolean | ❌ No  | false      | 大文字小文字を区別しない検索               |
| `maxResults`      | number  | ❌ No  | 100        | 返されるマッチの最大数(1-500)              |
| `contextLines`    | number  | ❌ No  | 0          | マッチの前後のコンテキスト行数(0-5)        |

### 使用例

```bash
# TypeScript ファイル内で "export function" を検索
curl -X POST http://localhost:3000/files/search \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tools",
    "pattern": "**/*.ts",
    "query": "export function",
    "caseInsensitive": true
  }'

# import 文を正規表現で検索
curl -X POST http://localhost:3000/files/search \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace",
    "query": "import\\s+\\{[^}]+\\}\\s+from",
    "isRegex": true,
    "maxResults": 50
  }'
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "query": "export function",
    "isRegex": false,
    "caseInsensitive": true,
    "matches": [
      {
        "file": "/tools/mcp/client.ts",
        "relativePath": "mcp/client.ts",
        "lineNumber": 10,
        "columnStart": 0,
        "columnEnd": 15,
        "lineContent": "export function callTool(name: string, args: unknown) {",
        "contextBefore": [],
        "contextAfter": []
      },
      {
        "file": "/tools/utils/math.ts",
        "relativePath": "utils/math.ts",
        "lineNumber": 5,
        "columnStart": 0,
        "columnEnd": 15,
        "lineContent": "export function add(a: number, b: number): number {",
        "contextBefore": [],
        "contextAfter": []
      }
    ],
    "totalMatches": 23,
    "filesSearched": 15,
    "filesWithMatches": 8,
    "truncated": false
  },
  "executionTime": 150
}
```

#### レスポンスフィールド

| フィールド                       | 型      | 説明                                               |
| -------------------------------- | ------- | -------------------------------------------------- |
| `result.query`                   | string  | 使用された検索クエリ                               |
| `result.isRegex`                 | boolean | 正規表現モードが使用されたかどうか                 |
| `result.caseInsensitive`         | boolean | 大文字小文字を区別しないモードが使用されたかどうか |
| `result.matches`                 | array   | マッチ結果の配列                                   |
| `result.matches[].file`          | string  | ファイルへの絶対パス                               |
| `result.matches[].relativePath`  | string  | 検索ベースからの相対パス                           |
| `result.matches[].lineNumber`    | number  | マッチの行番号(1 から始まる)                       |
| `result.matches[].columnStart`   | number  | マッチの開始列(0 から始まる)                       |
| `result.matches[].columnEnd`     | number  | マッチの終了列(0 から始まる)                       |
| `result.matches[].lineContent`   | string  | マッチした行の完全な内容                           |
| `result.matches[].contextBefore` | array   | マッチの前の行(contextLines > 0 の場合)            |
| `result.matches[].contextAfter`  | array   | マッチの後の行(contextLines > 0 の場合)            |
| `result.totalMatches`            | number  | 見つかったマッチの総数                             |
| `result.filesSearched`           | number  | 検索されたファイル数                               |
| `result.filesWithMatches`        | number  | 少なくとも 1 つのマッチを含むファイル数            |
| `result.truncated`               | boolean | 結果が切り詰められたかどうか                       |

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 400 Bad Request - 無効な正規表現

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid regex pattern",
    "details": {
      "field": "query",
      "value": "[invalid(",
      "reason": "Unterminated character class"
    }
  },
  "executionTime": 1
}
```

#### 408 Request Timeout - 検索タイムアウト

```json
{
  "success": false,
  "error": {
    "type": "TimeoutError",
    "message": "Search operation timed out",
    "details": {
      "timeout": 30000,
      "filesSearched": 150,
      "partialMatches": 45
    }
  },
  "executionTime": 30001
}
```

---

## セキュリティ上の考慮事項

### パストラバーサル防止

すべてのファイル操作は厳格なパス検証を実施します:

1. **許可されたベースパス**: `/workspace` および `/tools` ディレクトリのみがアクセス可能
2. **パス正規化**: `..` および `.` コンポーネントを解決するためにパスを正規化
3. **シンボリックリンクの解決**: シンボリックリンクを解決し、許可されたパスに対して検証
4. **隠しファイル制御**: デフォルトで隠しファイルを除外

```typescript
// パス検証ロジック(疑似コード)
function validatePath(path: string): boolean {
  const resolvedPath = Deno.realPathSync(path);
  const allowedPaths = [config.workspaceDir, config.toolsDir];
  return allowedPaths.some((allowed) => resolvedPath.startsWith(allowed));
}
```

### リソース制限

| リソース             | 制限  | 説明                                       |
| -------------------- | ----- | ------------------------------------------ |
| ファイルサイズ       | 10 MB | 読み取り操作の最大ファイルサイズ           |
| ディレクトリ深度     | 100   | 再帰的一覧表示の最大深度                   |
| 一覧結果             | 1000  | 一覧表示操作で返される最大ファイル数       |
| 検索結果             | 500   | 検索操作で返される最大マッチ数             |
| 検索タイムアウト     | 30 秒 | 検索操作の最大時間                         |
| 正規表現タイムアウト | 5 秒  | ファイルごとの正規表現マッチングの最大時間 |

### 正規表現のセキュリティ

ReDoS (Regular Expression Denial of Service) 攻撃を防ぐために:

1. **正規表現の複雑さ**: 複雑なパターンは拒否されます
2. **マッチタイムアウト**: 各ファイルに 5 秒の正規表現タイムアウトがあります
3. **パターン検証**: 実行前にパターンを検証します

---

## エラータイプ

| エラータイプ        | HTTP ステータス | 説明                                     |
| ------------------- | --------------- | ---------------------------------------- |
| `ValidationError`   | 400             | 無効なリクエストパラメータ               |
| `FileNotFoundError` | 404             | ファイルまたはディレクトリが見つからない |
| `TimeoutError`      | 408             | 操作がタイムアウト                       |
| `InternalError`     | 500             | サーバー内部エラー                       |

---

## 設定

ファイルエクスプローラー API は以下の環境変数を考慮します:

| 変数                           | デフォルト   | 説明                                     |
| ------------------------------ | ------------ | ---------------------------------------- |
| `WORKSPACE_DIR`                | `/workspace` | ワークスペースディレクトリパス           |
| `TOOLS_DIR`                    | `/tools`     | ツールディレクトリパス                   |
| `FILE_EXPLORER_ENABLED`        | `true`       | ファイルエクスプローラー API の有効/無効 |
| `FILE_EXPLORER_MAX_FILE_SIZE`  | `10485760`   | 読み取りの最大ファイルサイズ(バイト)     |
| `FILE_EXPLORER_MAX_RESULTS`    | `1000`       | 一覧/検索の最大結果数                    |
| `FILE_EXPLORER_SEARCH_TIMEOUT` | `30000`      | 検索操作のタイムアウト(ミリ秒)           |

---

## 既存 API との統合

### ワークフロー: AI Agent のファイル探索

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AI Agent ワークフロー                                                    │
│                                                                         │
│  1. GET /files/list?path=/tools&pattern=**/*.ts                         │
│     └─ 利用可能なツールを発見                                            │
│                                                                         │
│  2. GET /files/read?path=/tools/mcp/client.ts                          │
│     └─ ツールのソースコードを読み取る                                     │
│                                                                         │
│  3. POST /files/search                                                  │
│     └─ 特定の関数やパターンを検索                                        │
│                                                                         │
│  4. PUT /workspace                                                      │
│     └─ 生成された TypeScript コードを保存                                │
│                                                                         │
│  5. POST /execute                                                       │
│     └─ 保存されたコードを実行                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 既存エンドポイントとの連携

| エンドポイント   | 統合                                               |
| ---------------- | -------------------------------------------------- |
| `PUT /workspace` | ファイルエクスプローラーで発見したコードを保存     |
| `POST /execute`  | ファイルエクスプローラーでレビュー後にコードを実行 |
| `POST /lint`     | 実行前にコードをリント                             |
| `GET /health`    | サービスの可用性を監視                             |

---

## テストの考慮事項

### 単体テスト

1. パス検証(トラバーサル防止)
2. glob パターンマッチング
3. 様々なエンコーディングでのファイル読み取り
4. エッジケースを含む正規表現検索
5. リソース制限の適用

### 統合テスト

1. 一覧表示 → 読み取り → 検索のワークフロー
2. 大量のファイルセットでの検索
3. 同時アクセスの処理
4. エラー処理と復旧

### セキュリティテスト

1. パストラバーサルの試行(`../../../etc/passwd`)
2. シンボリックリンクのエスケープ
3. ReDoS パターン
4. 大きなファイル攻撃
5. 隠しファイルへのアクセス

---

## 今後の拡張

1. **ストリーミングサポート**: チャンク転送による大きなファイルコンテンツのストリーミング
2. **ファイル監視**: WebSocket ベースのファイル変更通知
3. **キャッシング**: より高速な一覧表示のためのファイルメタデータのキャッシュ
4. **圧縮**: 大きなレスポンスの gzip 圧縮サポート
5. **ファイル差分**: 2 つのファイルを比較して差分を返す
6. **シンタックスハイライト**: コードファイルのオプションのシンタックスハイライト
