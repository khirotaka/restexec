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

