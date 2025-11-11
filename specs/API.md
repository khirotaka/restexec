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
  "timeout": 5000
}
```

**パラメータ**:

| フィールド | 型 | 必須 | デフォルト値 | 説明 |
|-----------|-----|------|------------|------|
| `codeId` | string | ✅ Yes | - | 実行するコードファイルの識別子（拡張子なし） |
| `timeout` | number | ❌ No | 5000 | タイムアウト時間（ミリ秒単位） |

**バリデーションルール**:
- `codeId`: 必須、空文字列不可、パス区切り文字（`/`, `\`）を含まない
- `timeout`: オプション、指定する場合は正の整数（1 ≤ timeout ≤ 300000）

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
| フィールド | 型 | 説明 |
|-----------|-----|------|
| `success` | boolean | 実行成功フラグ（常に `true`） |
| `result` | any | 実行コードからの出力結果（JSONオブジェクト） |
| `executionTime` | number | 実行時間（ミリ秒） |

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
| エラータイプ | HTTPステータス | 説明 |
|------------|--------------|------|
| `ValidationError` | 400 | リクエストパラメータのバリデーションエラー |
| `FileNotFoundError` | 404 | 指定されたコードファイルが存在しない |
| `TimeoutError` | 408 | 実行がタイムアウトした |
| `ExecutionError` | 500 | コード実行中のエラー |
| `InternalError` | 500 | サーバー内部エラー |

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

| フィールド | 型 | 必須 | デフォルト値 | 説明 |
|-----------|-----|------|------------|------|
| `codeId` | string | ✅ Yes | - | Lintを実行するコードファイルの識別子（拡張子なし） |
| `timeout` | number | ❌ No | 5000 | タイムアウト時間（ミリ秒単位） |

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
| フィールド | 型 | 説明 |
|-----------|-----|------|
| `success` | boolean | 実行成功フラグ（常に `true`） |
| `result.version` | number | Deno lintの出力フォーマットバージョン |
| `result.diagnostics` | array | Lint診断結果の配列 |
| `result.errors` | array | Lint実行中に発生したエラーの配列 |
| `result.checkedFiles` | array | チェックされたファイルパスの配列 |
| `executionTime` | number | 実行時間（ミリ秒） |

**Diagnostic オブジェクト**:
| フィールド | 型 | 説明 |
|-----------|-----|------|
| `code` | string | Lintルールコード（例: "no-unused-vars"） |
| `message` | string | Lint問題の説明 |
| `range.start` | object | 問題の開始位置（行と列） |
| `range.end` | object | 問題の終了位置（行と列） |
| `filename` | string | 問題が見つかったファイルパス |
| `hint` | string | 修正の提案（オプション） |

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
| エラータイプ | HTTPステータス | 説明 |
|------------|--------------|------|
| `ValidationError` | 400 | リクエストパラメータのバリデーションエラー |
| `FileNotFoundError` | 404 | 指定されたコードファイルが存在しない |
| `TimeoutError` | 408 | Lint実行がタイムアウトした |
| `ExecutionError` | 500 | Lint実行中のエラー |
| `InternalError` | 500 | サーバー内部エラー |

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

