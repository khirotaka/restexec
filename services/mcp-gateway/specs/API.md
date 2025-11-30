# API仕様

## エンドポイント一覧

| エンドポイント | メソッド | 説明                       |
| -------------- | -------- | -------------------------- |
| `/mcp/call`    | POST     | MCP Tool 呼び出し          |
| `/mcp/tools`   | GET      | 利用可能な Tool リスト取得 |
| `/health`      | GET      | ヘルスチェック             |

---

## エンドポイント: POST /mcp/call

### リクエスト仕様

**URL**: `http://localhost:3001/mcp/call`

**Method**: `POST`

**Content-Type**: `application/json`

**Request Body**:

どの MCP Server の どのTool を呼び出すかを明示的に指定する。

```json
{
  "server": "health-server",
  "toolName": "calculate-bmi",
  "input": {
    "weight_kg": 70,
    "height_m": 1.75
  }
}
```

**パラメータ**:

| フィールド | 型     | 必須   | デフォルト値 | 説明                      |
| ---------- | ------ | ------ | ------------ | ------------------------- |
| `server`   | string | ✅ Yes | -            | MCP Server の名前         |
| `toolName` | string | ✅ Yes | -            | 実行する Tool の名前      |
| `input`    | object | ✅ Yes | -            | Tool に渡す入力パラメータ |

**バリデーションルール**:

- `server`: 必須、空文字列不可、英数字とハイフン・アンダースコアのみ (`/^[a-zA-Z0-9-_]+$/`)、最大長50文字
- `toolName`: 必須、空文字列不可、英数字とハイフン・アンダースコアのみ (`/^[a-zA-Z0-9-_]+$/`)、最大長100文字
- `input`: 必須、オブジェクト型、最大サイズ 100KB、ネストの深さ最大10階層

### レスポンス仕様

#### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "bmi": 22.86,
    "category": "normal"
  }
}
```

**フィールド**:

| フィールド | 型      | 説明                                         |
| ---------- | ------- | -------------------------------------------- |
| `success`  | boolean | 実行成功フラグ（常に `true`）                |
| `result`   | any     | Tool の実行結果（MCP Server から返された値） |

#### エラーレスポンス (4xx, 5xx)

```json
{
  "success": false,
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "Tool execution failed: Invalid input",
    "details": {
      "toolName": "string",
      "server": "string",
      "field": "string"
    }
  }
}
```

**エラータイプ**:

| エラーコード           | HTTPステータス | 説明                                           |
| ---------------------- | -------------- | ---------------------------------------------- |
| `VALIDATION_ERROR`     | 400            | リクエストパラメータのバリデーションエラー     |
| `SERVER_NOT_FOUND`     | 404            | 指定された MCP Server が存在しない             |
| `TOOL_NOT_FOUND`       | 404            | 指定された Tool が存在しない                   |
| `TIMEOUT_ERROR`        | 408            | Tool 呼び出しがタイムアウト                    |
| `SERVER_NOT_RUNNING`   | 503            | MCP Server が起動していない、または停止中      |
| `SERVER_CRASHED`       | 502            | MCP Server がクラッシュした                    |
| `TOOL_EXECUTION_ERROR` | 500            | Tool 実行中のエラー（MCP Server からのエラー） |
| `INTERNAL_ERROR`       | 500            | サーバー内部エラー                             |

**エラーレスポンス例**:

**toolName のバリデーションエラー**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "toolName contains invalid characters",
    "details": {
      "field": "toolName",
      "value": "invalid@tool",
      "pattern": "/^[a-zA-Z0-9-_]+$/"
    }
  }
}
```

**input のサイズ超過**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "input exceeds maximum size (100KB)",
    "details": {
      "field": "input",
      "size": 102400,
      "max": 102400
    }
  }
}
```

**Tool が見つからない**:

```json
{
  "success": false,
  "error": {
    "code": "TOOL_NOT_FOUND",
    "message": "Tool 'unknown-tool' not found",
    "details": {
      "toolName": "unknown-tool"
    }
  }
}
```

**タイムアウト**:

```json
{
  "success": false,
  "error": {
    "code": "TIMEOUT_ERROR",
    "message": "Tool execution timed out after 30000ms",
    "details": {
      "toolName": "slow-tool",
      "timeout": 30000
    }
  }
}
```

**MCP Server が起動していない**:

```json
{
  "success": false,
  "error": {
    "code": "SERVER_NOT_RUNNING",
    "message": "MCP Server 'weather-server' is not running",
    "details": {
      "server": "weather-server",
      "status": "stopped"
    }
  }
}
```

**MCP Server がクラッシュ**:

```json
{
  "success": false,
  "error": {
    "code": "SERVER_CRASHED",
    "message": "MCP Server 'weather-server' has crashed",
    "details": {
      "server": "weather-server",
      "exitCode": 1
    }
  }
}
```

**Tool 実行エラー（MCP Server からのエラー）**:

```json
{
  "success": false,
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "Invalid params: weight_kg must be positive",
    "details": {
      "toolName": "calculate-bmi",
      "jsonrpcCode": -32602
    }
  }
}
```

### 使用例

#### 基本的な呼び出し

**Request**:

```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "health-server",
    "toolName": "calculate-bmi",
    "input": {
      "weight_kg": 70,
      "height_m": 1.75
    }
  }'
```

**Response**:

```json
{
  "success": true,
  "result": {
    "bmi": 22.86,
    "category": "normal"
  }
}
```

#### 複雑な入力パラメータ

**Request**:

```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "weather-server",
    "toolName": "fetch-weather",
    "input": {
      "city": "Tokyo",
      "units": "metric",
      "options": {
        "includeHourly": true,
        "includeForecast": false
      }
    }
  }'
```

**Response**:

```json
{
  "success": true,
  "result": {
    "temperature": 15.5,
    "condition": "cloudy",
    "humidity": 65,
    "hourly": [
      { "time": "2025-11-29T10:00:00Z", "temp": 15.5 },
      { "time": "2025-11-29T11:00:00Z", "temp": 16.0 }
    ]
  }
}
```

---

## エンドポイント: GET /mcp/tools

### リクエスト仕様

**URL**: `http://localhost:3001/mcp/tools`

**Method**: `GET`

### レスポンス仕様

#### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "tools": [
    {
      "name": "calculate-bmi",
      "description": "Calculate Body Mass Index",
      "server": "health-server",
      "inputSchema": {
        "type": "object",
        "properties": {
          "weight_kg": {
            "type": "number",
            "description": "Weight in kilograms"
          },
          "height_m": {
            "type": "number",
            "description": "Height in meters"
          }
        },
        "required": ["weight_kg", "height_m"]
      }
    },
    {
      "name": "fetch-weather",
      "description": "Fetch current weather for a city",
      "server": "weather-server",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "City name"
          },
          "units": {
            "type": "string",
            "enum": ["metric", "imperial"],
            "description": "Temperature units"
          }
        },
        "required": ["city"]
      }
    }
  ]
}
```

**フィールド**:

| フィールド            | 型      | 説明                               |
| --------------------- | ------- | ---------------------------------- |
| `success`             | boolean | 成功フラグ（常に `true`）          |
| `tools`               | array   | 利用可能な Tool の配列             |
| `tools[].name`        | string  | Tool 名                            |
| `tools[].description` | string  | Tool の説明                        |
| `tools[].server`      | string  | Tool を提供する MCP Server 名      |
| `tools[].inputSchema` | object  | Tool の入力スキーマ（JSON Schema） |

### 使用例

**Request**:

```bash
curl -X GET http://localhost:3001/mcp/tools
```

**Response**:

```json
{
  "success": true,
  "tools": [
    {
      "name": "calculate-bmi",
      "description": "Calculate Body Mass Index",
      "server": "health-server",
      "inputSchema": {
        "type": "object",
        "properties": {
          "weight_kg": { "type": "number", "description": "Weight in kilograms" },
          "height_m": { "type": "number", "description": "Height in meters" }
        },
        "required": ["weight_kg", "height_m"]
      }
    }
  ]
}
```

---

## エンドポイント: GET /health

### リクエスト仕様

**URL**: `http://localhost:3001/health`

**Method**: `GET`

### レスポンス仕様

#### 成功レスポンス (200 OK)

```json
{
  "status": "ok",
  "uptime": 12345.678,
  "servers": {
    "weather-server": "available",
    "database-server": "available",
    "health-server": "available"
  }
}
```

**フィールド**:

| フィールド       | 型     | 説明                                                       |
| ---------------- | ------ | ---------------------------------------------------------- |
| `status`         | string | サーバーステータス（"ok" または "degraded"）               |
| `uptime`         | number | 起動時間（秒）                                             |
| `servers`        | object | 各 MCP Server のステータス                                 |
| `servers.<name>` | string | MCP Server の状態（"available", "unavailable", "crashed"） |

**status の値**:

- `"ok"`: すべての MCP Server が available
- `"degraded"`: 一部の MCP Server が unavailable または crashed

**servers.<name> の値**:

- `"available"`: MCP Server が正常に動作中
- `"unavailable"`: MCP Server が停止中
- `"crashed"`: MCP Server がクラッシュして異常終了

#### 異常時のレスポンス (200 OK)

```json
{
  "status": "degraded",
  "uptime": 12345.678,
  "servers": {
    "weather-server": "available",
    "database-server": "unavailable",
    "health-server": "crashed"
  }
}
```

### 使用例

**Request**:

```bash
curl -X GET http://localhost:3001/health
```

**Response (すべて正常)**:

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "servers": {
    "weather-server": "available",
    "database-server": "available"
  }
}
```

**Response (一部異常)**:

```json
{
  "status": "degraded",
  "uptime": 3600.5,
  "servers": {
    "weather-server": "available",
    "database-server": "unavailable"
  }
}
```

---

## エラーハンドリング

### 共通エラーレスポンス形式

すべてのエラーレスポンスは以下の形式に従います：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // 追加情報（エラータイプごとに異なる）
    }
  }
}
```

### HTTPステータスコードの使用方針

| ステータスコード          | 説明                 | 使用ケース                                              |
| ------------------------- | -------------------- | ------------------------------------------------------- |
| 200 OK                    | 成功                 | Tool 呼び出し成功、Tools リスト取得成功、ヘルスチェック |
| 400 Bad Request           | バリデーションエラー | パラメータ不正、形式エラー                              |
| 404 Not Found             | リソース未検出       | Tool が存在しない                                       |
| 408 Request Timeout       | タイムアウト         | Tool 呼び出しがタイムアウト                             |
| 500 Internal Server Error | サーバー内部エラー   | Tool 実行エラー、内部エラー                             |
| 502 Bad Gateway           | ゲートウェイエラー   | MCP Server がクラッシュ                                 |
| 503 Service Unavailable   | サービス利用不可     | MCP Server が起動していない                             |

---

## 実装上の注意点

### リクエストサイズ制限

- **リクエストボディ全体**: 最大 1MB
- **input パラメータ**: 最大 100KB
- **ネストの深さ**: 最大 10階層

これらの制限を超えた場合は `VALIDATION_ERROR` (400) を返します。

### タイムアウト処理

- Tool 呼び出しのタイムアウトは config.yaml または環境変数で設定
- タイムアウト時は `TIMEOUT_ERROR` (408) を返し、Tool 呼び出しをキャンセル
- MCP Server プロセスは維持される（次のリクエストに備える）

### エラーメッセージの抽象化

セキュリティ上の理由から、エラーメッセージは内部実装の詳細を露出しないように抽象化されます：

- ❌ 悪い例: `Error: Failed to connect to MCP Server at /var/run/mcp/weather.sock`
- ✅ 良い例: `MCP Server 'weather-server' is not running`

### バリデーション/サニタイズの無効化

環境変数 `DISABLE_VALIDATION=true` が設定されている場合、入力バリデーションとサニタイズが無効化されます。**本番環境では絶対に使用しないでください**。

詳細は [Security.md](Security.md) を参照してください。

---

## テスト要件

### 正常系テスト

- [ ] Tool 呼び出しが成功する
- [ ] Tools リスト取得が成功する
- [ ] ヘルスチェックが成功する
- [ ] 複雑な入力パラメータが正しく処理される

### 異常系テスト

- [ ] toolName のバリデーションエラー
- [ ] input のサイズ超過エラー
- [ ] 存在しない Tool の呼び出し
- [ ] タイムアウトエラー
- [ ] MCP Server が起動していない場合
- [ ] MCP Server がクラッシュした場合

### エッジケーステスト

- [ ] 空の input オブジェクト
- [ ] 深くネストされた input
- [ ] 特殊文字を含む toolName
- [ ] 同時リクエストの処理

---

## 関連ドキュメント

- [SystemArchitecture.md](SystemArchitecture.md) - システム構成図
- [Security.md](Security.md) - セキュリティモデルとバリデーション詳細
- [MCPProtocol.md](MCPProtocol.md) - MCP Protocol 実装詳細
- [Configuration.md](Configuration.md) - 環境変数と config.yaml 仕様
- [Sequence.md](Sequence.md) - リクエスト処理フロー
