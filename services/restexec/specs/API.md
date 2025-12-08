# API仕様

## エンドポイント: POST /execute

### リクエスト仕様

**URL**: `http://localhost:3000/execute`

**Method**: `POST`

**Content-Type**: `application/json`

**Request Body**:

```json
{
  "codeId": "exec-20250109-123456",
  "timeout": 5000,
  "env": {
    "API_KEY": "your-api-key",
    "DEBUG_MODE": "true"
  }
}
```

**パラメータ**:

| フィールド | 型     | 必須   | デフォルト値 | 説明                                         |
| ---------- | ------ | ------ | ------------ | -------------------------------------------- |
| `codeId`   | string | ✅ Yes | -            | 実行するコードファイルの識別子（拡張子なし） |
| `timeout`  | number | ❌ No  | 5000         | タイムアウト時間（ミリ秒単位）               |
| `env`      | object | ❌ No  | {}           | 実行コードに渡す環境変数（キーと値のペア）   |

**バリデーションルール**:

- `codeId`: 必須、空文字列不可、パス区切り文字（`/`, `\`）を含まない
- `timeout`: オプション、指定する場合は正の整数（1 ≤ timeout ≤ 300000）
- `env`: オプション、環境変数のオブジェクト
  - **キー形式**: 大文字英数字とアンダースコアのみ (`/^[A-Z0-9_]+$/`)
  - **値の型**: 文字列のみ
  - **値の最大長**: 1000文字
  - **最大個数**: 50個
  - **全体サイズ**: 10KB以内（すべてのキーと値の合計バイト数）
  - **禁止されたキー**: `PATH`, `DENO_DIR`, `HOME`, `USER`, `PWD`, `SHELL`, `HOSTNAME`, `TMPDIR`, `TEMP`, `TMP`, および `DENO_` で始まるすべての変数

### レスポンス仕様

#### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "message": "Execution completed",
    "data": { ... }
  },
  "executionTime": 1234
}
```

**フィールド**:

| フィールド      | 型      | 説明                                         |
| --------------- | ------- | -------------------------------------------- |
| `success`       | boolean | 実行成功フラグ（常に `true`）                |
| `result`        | any     | 実行コードからの出力結果（JSONオブジェクト） |
| `executionTime` | number  | 実行時間（ミリ秒）                           |

#### エラーレスポンス (4xx, 5xx)

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "codeId is required",
    "details": { ... }
  },
  "executionTime": 123
}
```

**エラータイプ**:

| エラータイプ        | HTTPステータス | 説明                                       |
| ------------------- | -------------- | ------------------------------------------ |
| `ValidationError`   | 400            | リクエストパラメータのバリデーションエラー |
| `FileNotFoundError` | 404            | 指定されたコードファイルが存在しない       |
| `TimeoutError`      | 408            | 実行がタイムアウトした                     |
| `ExecutionError`    | 500            | コード実行中のエラー                       |
| `InternalError`     | 500            | サーバー内部エラー                         |

**エラーレスポンス例**:

**禁止された環境変数キーを使用した場合**:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "env key \"PATH\" is forbidden",
    "details": {
      "field": "env",
      "key": "PATH",
      "reason": "reserved system variable"
    }
  }
}
```

**環境変数のキー形式が不正な場合**:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "env keys must contain only uppercase letters, numbers, and underscores",
    "details": {
      "field": "env",
      "key": "api-key",
      "pattern": "/^[A-Z0-9_]+$/"
    }
  }
}
```

**環境変数の値が最大長を超えた場合**:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "env value for \"API_KEY\" exceeds maximum length",
    "details": {
      "field": "env",
      "key": "API_KEY",
      "length": 1001,
      "max": 1000
    }
  }
}
```

**環境変数の個数が最大を超えた場合**:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "env must not exceed 50 entries",
    "details": {
      "field": "env",
      "count": 51,
      "max": 50
    }
  }
}
```

**環境変数の全体サイズが最大を超えた場合**:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "env total size exceeds maximum allowed size",
    "details": {
      "field": "env",
      "size": 10241,
      "max": 10240
    }
  }
}
```

## エンドポイント: POST /lint

### リクエスト仕様

**URL**: `http://localhost:3000/lint`

**Method**: `POST`

**Content-Type**: `application/json`

**Request Body**:

```json
{
  "codeId": "example-code",
  "timeout": 5000
}
```

**パラメータ**:

| フィールド | 型     | 必須   | デフォルト値 | 説明                                               |
| ---------- | ------ | ------ | ------------ | -------------------------------------------------- |
| `codeId`   | string | ✅ Yes | -            | Lintを実行するコードファイルの識別子（拡張子なし） |
| `timeout`  | number | ❌ No  | 5000         | タイムアウト時間（ミリ秒単位）                     |

**バリデーションルール**:

- `codeId`: 必須、空文字列不可、パス区切り文字（`/`, `\`）を含まない
- `timeout`: オプション、指定する場合は正の整数（1 ≤ timeout ≤ 300000）

### レスポンス仕様

#### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [
      {
        "code": "no-unused-vars",
        "message": "'unusedVariable' is declared but never used",
        "range": {
          "start": { "line": 5, "col": 6 },
          "end": { "line": 5, "col": 20 }
        },
        "filename": "/workspace/example-code.ts",
        "hint": "Remove the unused variable or prefix it with an underscore"
      }
    ],
    "errors": [],
    "checkedFiles": [
      "/workspace/example-code.ts"
    ]
  },
  "executionTime": 234
}
```

**フィールド**:

| フィールド            | 型      | 説明                                  |
| --------------------- | ------- | ------------------------------------- |
| `success`             | boolean | 実行成功フラグ（常に `true`）         |
| `result.version`      | number  | Deno lintの出力フォーマットバージョン |
| `result.diagnostics`  | array   | Lint診断結果の配列                    |
| `result.errors`       | array   | Lint実行中に発生したエラーの配列      |
| `result.checkedFiles` | array   | チェックされたファイルパスの配列      |
| `executionTime`       | number  | 実行時間（ミリ秒）                    |

**Diagnostic オブジェクト**:

| フィールド    | 型     | 説明                                     |
| ------------- | ------ | ---------------------------------------- |
| `code`        | string | Lintルールコード（例: "no-unused-vars"） |
| `message`     | string | Lint問題の説明                           |
| `range.start` | object | 問題の開始位置（行と列）                 |
| `range.end`   | object | 問題の終了位置（行と列）                 |
| `filename`    | string | 問題が見つかったファイルパス             |
| `hint`        | string | 修正の提案（オプション）                 |

#### エラーレスポンス (4xx, 5xx)

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "codeId is required",
    "details": { ... }
  },
  "executionTime": 123
}
```

**エラータイプ**:

| エラータイプ        | HTTPステータス | 説明                                       |
| ------------------- | -------------- | ------------------------------------------ |
| `ValidationError`   | 400            | リクエストパラメータのバリデーションエラー |
| `FileNotFoundError` | 404            | 指定されたコードファイルが存在しない       |
| `TimeoutError`      | 408            | Lint実行がタイムアウトした                 |
| `ExecutionError`    | 500            | Lint実行中のエラー                         |
| `InternalError`     | 500            | サーバー内部エラー                         |

### 使用例

#### クリーンなファイルのLint

**Request**:

```bash
curl -X POST http://localhost:3000/lint \
  -H "Content-Type: application/json" \
  -d '{"codeId": "hello-world"}'
```

**Response**:

```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [],
    "errors": [],
    "checkedFiles": ["/workspace/hello-world.ts"]
  },
  "executionTime": 123
}
```

#### 問題のあるファイルのLint

**Request**:

```bash
curl -X POST http://localhost:3000/lint \
  -H "Content-Type: application/json" \
  -d '{"codeId": "code-with-issues", "timeout": 10000}'
```

**Response**:

```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [
      {
        "code": "no-unused-vars",
        "message": "'unusedVariable' is declared but never used",
        "range": {
          "start": { "line": 2, "col": 6 },
          "end": { "line": 2, "col": 20 }
        },
        "filename": "/workspace/code-with-issues.ts",
        "hint": "Remove the unused variable or prefix it with an underscore"
      }
    ],
    "errors": [],
    "checkedFiles": ["/workspace/code-with-issues.ts"]
  },
  "executionTime": 234
}
```

## エンドポイント: GET /health

### リクエスト仕様

**URL**: `http://localhost:3000/health`

**Method**: `GET`

### レスポンス仕様

```json
{
  "status": "ok",
  "uptime": 12345.678,
  "activeProcesses": 2,
  "memoryUsage": {
    "rss": 50331648,
    "heapTotal": 16777216,
    "heapUsed": 8388608,
    "external": 1048576
  },
  "version": "1.0.0"
}
```

## File Explorer API

File Explorer API は `/workspace` および `/tools` ディレクトリ内のファイルを探索・検索するためのエンドポイントを提供します。

### エンドポイント一覧

| Method | Endpoint        | 説明                                           |
| ------ | --------------- | ---------------------------------------------- |
| `GET`  | `/files/list`   | ディレクトリ内のファイル一覧を取得（glob対応） |
| `GET`  | `/files/read`   | ファイルの内容を読み取り                       |
| `POST` | `/files/search` | ファイル内容を検索（grep機能）                 |

詳細な仕様は [FileExplorerAPI.md](./FileExplorerAPI.md) を参照してください。

### 使用例

```bash
# ファイル一覧を取得
curl "http://localhost:3000/files/list?path=/tools&pattern=**/*.ts"

# ファイルを読み取り
curl "http://localhost:3000/files/read?path=/tools/mcp/client.ts"

# ファイル内容を検索
curl -X POST http://localhost:3000/files/search \
  -H "Content-Type: application/json" \
  -d '{"path": "/tools", "query": "export function", "pattern": "**/*.ts"}'
```
