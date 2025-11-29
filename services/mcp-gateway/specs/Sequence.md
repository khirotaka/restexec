# 実行フローシーケンス

## 正常系シーケンス

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST Client<br/>(User Code)
    participant HTTP as HTTP Server<br/>(Gin)
    participant Validator as Request<br/>Validator
    participant MCPMgr as MCP Client<br/>Manager
    participant Process as Process<br/>Manager
    participant MCP as MCP Server<br/>(STDIO Process)

    Client->>HTTP: POST /mcp/call<br/>{server: "health-server", toolName: "calculate-bmi", input: {...}}

    rect rgb(230, 245, 255)
        Note over HTTP,Validator: Phase 1: リクエスト検証
        HTTP->>Validator: Validate request
        Validator->>Validator: Check server name format
        Validator->>Validator: Check toolName format
        Validator->>Validator: Check input size & depth
        Validator->>Validator: Check Prototype Pollution
        alt Validation Failed
            Validator-->>HTTP: ValidationError
            HTTP-->>Client: 400 Bad Request
        end
    end

    rect rgb(240, 255, 240)
        Note over MCPMgr,Process: Phase 2: Tool と Server の確認
        HTTP->>MCPMgr: callTool(server, toolName, input)
        MCPMgr->>MCPMgr: Get MCP Client by server name
        alt Server Not Found
            MCPMgr-->>HTTP: ServerNotFoundError
            HTTP-->>Client: 404 Not Found
        end
        MCPMgr->>Process: Check server status
        alt Server Unavailable
            Process-->>MCPMgr: Status: unavailable
            MCPMgr-->>HTTP: ServerNotRunningError
            HTTP-->>Client: 503 Service Unavailable
        end
    end

    rect rgb(255, 250, 240)
        Note over MCPMgr,MCP: Phase 3: Tools Call (SDK)
        MCPMgr->>MCPMgr: Create timeout timer
        MCPMgr->>MCP: client.callTool({name, arguments})
        activate MCP
        Note over MCP: SDK handles JSON-RPC internally
        MCP->>MCP: Execute tool
        MCP-->>MCPMgr: Tool result
        deactivate MCP
        alt Timeout
            MCPMgr-->>HTTP: TimeoutError
            HTTP-->>Client: 408 Request Timeout
        end
        alt JSON-RPC Error
            MCPMgr->>MCPMgr: Map error to HTTP
            MCPMgr-->>HTTP: ToolExecutionError
            HTTP-->>Client: 400/500 Error
        end
    end

    rect rgb(255, 240, 255)
        Note over MCPMgr,HTTP: Phase 4: レスポンスパース
        MCPMgr->>MCPMgr: Cancel timeout timer
        MCPMgr->>MCPMgr: Validate response
        MCPMgr->>MCPMgr: Sanitize result
        MCPMgr-->>HTTP: Tool result
    end

    rect rgb(245, 245, 245)
        Note over HTTP,Client: Phase 5: 結果返却
        HTTP->>HTTP: Build response
        HTTP-->>Client: 200 OK<br/>{success: true, result: {...}}
    end
```

---

## エラーハンドリングフロー

```mermaid
stateDiagram-v2
    [*] --> ReceiveRequest: POST /mcp/call

    ReceiveRequest --> ValidateRequest: Parse JSON

    ValidateRequest --> FindTool: Valid
    ValidateRequest --> ReturnError400: Invalid (toolName/input)

    FindTool --> CheckServerStatus: Server found
    FindTool --> ReturnError404: Server not found

    CheckServerStatus --> SendToolCall: Server available
    CheckServerStatus --> ReturnError503: Server unavailable

    SendToolCall --> WaitResponse: JSON-RPC request sent
    SendToolCall --> ReturnError500: Send failed

    WaitResponse --> ProcessTimeout: Timeout exceeded
    WaitResponse --> ProcessJSONRPCError: JSON-RPC error
    WaitResponse --> ProcessSuccess: Tool result received

    ProcessTimeout --> ReturnError408: Cancel request

    ProcessJSONRPCError --> MapError: Map to HTTP error
    MapError --> ReturnError400: -32600, -32602
    MapError --> ReturnError404: -32601
    MapError --> ReturnError500: -32603, other

    ProcessSuccess --> SanitizeResult: Validate response
    SanitizeResult --> ReturnSuccess: Valid result
    SanitizeResult --> ReturnError500: Invalid result

    ReturnError400 --> [*]: 400 Bad Request
    ReturnError404 --> [*]: 404 Not Found
    ReturnError408 --> [*]: 408 Request Timeout
    ReturnError500 --> [*]: 500 Internal Error
    ReturnError503 --> [*]: 503 Service Unavailable
    ReturnSuccess --> [*]: 200 OK

    note right of ValidateRequest
        - server名存在確認
        - server名形式確認 (/^[a-zA-Z0-9-_]+$/)
        - toolName存在確認
        - toolName形式確認 (/^[a-zA-Z0-9-_]+$/)
        - input サイズ確認 (100KB)
        - input ネスト深さ確認 (10階層)
        - Prototype Pollution チェック
    end note

    note right of SendToolCall
        - タイムアウトタイマー設定
        - SDK の client.callTool() 実行
        - 内部で JSON-RPC 通信
    end note

    note right of MapError
        -32700: Parse error → 500
        -32600: Invalid Request → 400
        -32601: Method not found → 404
        -32602: Invalid params → 400
        -32603: Internal error → 500
    end note
```

---

## Tools List 取得フロー

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST Client
    participant HTTP as HTTP Server
    participant MCPMgr as MCP Client<br/>Manager
    participant Cache as Tools Cache

    Client->>HTTP: GET /mcp/tools

    HTTP->>MCPMgr: getToolsList()
    MCPMgr->>Cache: Retrieve cached tools
    Cache-->>MCPMgr: Tools list

    MCPMgr->>MCPMgr: Format response
    MCPMgr-->>HTTP: Tools array

    HTTP->>HTTP: Build response
    HTTP-->>Client: 200 OK<br/>{success: true, tools: [...]}

    Note over Cache: Tools are cached at startup<br/>No runtime updates
```

---

## Health Check フロー

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST Client
    participant HTTP as HTTP Server
    participant Process as Process<br/>Manager

    Client->>HTTP: GET /health

    HTTP->>Process: Get server statuses
    loop For each MCP Server
        Process->>Process: Check process status
    end
    Process-->>HTTP: Status map<br/>{server1: "running", server2: "crashed"}

    HTTP->>HTTP: Determine overall status<br/>("ok" or "degraded")
    HTTP->>HTTP: Build response

    alt All servers running
        HTTP-->>Client: 200 OK<br/>{status: "ok", servers: {...}}
    else Some servers not running
        HTTP-->>Client: 200 OK<br/>{status: "degraded", servers: {...}}
    end
```

---

## MCP Gateway 起動フロー

```mermaid
sequenceDiagram
    autonumber
    participant Main as Main Process
    participant Config as Config Loader
    participant Process as Process<br/>Manager
    participant MCP as MCP Servers
    participant MCPMgr as MCP Client<br/>Manager
    participant HTTP as HTTP Server

    Main->>Config: Load config.yaml
    Config->>Config: Parse YAML
    Config->>Config: Validate config
    alt Invalid config
        Config-->>Main: Error: Invalid config
        Main->>Main: Exit with code 1
    end
    Config-->>Main: Server configs

    Main->>Process: Start MCP Servers
    loop For each server
        Process->>MCP: Spawn process
        MCP->>Process: Initialize (Capability Negotiation)
        alt Initialization failed
            Process-->>Main: Error: Server init failed
            Main->>Main: Exit with code 1
        end
    end
    Process-->>Main: All servers started

    Main->>MCPMgr: Request tools/list
    loop For each MCP Server
        MCPMgr->>MCP: tools/list
        MCP-->>MCPMgr: Tools array
        MCPMgr->>MCPMgr: Cache tools
    end
    MCPMgr-->>Main: All tools cached

    Main->>HTTP: Start HTTP server
    HTTP->>HTTP: Listen on port 3001
    HTTP-->>Main: Server ready

    Main->>Main: Log: MCP Gateway started
    Main->>Main: Ready to accept requests
```

---

## MCP Server クラッシュフロー

```mermaid
sequenceDiagram
    autonumber
    participant MCP as MCP Server<br/>(STDIO Process)
    participant Process as Process<br/>Manager
    participant MCPMgr as MCP Client<br/>Manager
    participant HTTP as HTTP Server
    participant Client as REST Client

    MCP->>MCP: Critical error occurs
    MCP->>Process: Process exits (code ≠ 0)
    Process->>Process: Detect crash
    Process->>Process: Update status: "crashed"
    Process->>Process: Log error

    Note over Process: Server is NOT restarted

    Client->>HTTP: POST /mcp/call<br/>{toolName: "weather-tool"}
    HTTP->>MCPMgr: callTool(...)
    MCPMgr->>Process: Check server status
    Process-->>MCPMgr: Status: "crashed"
    MCPMgr-->>HTTP: ServerCrashedError
    HTTP-->>Client: 502 Bad Gateway<br/>{error: {code: "SERVER_CRASHED", ...}}

    Note over Client,HTTP: Manual restart required
```

---

## タイムアウトフロー

```mermaid
sequenceDiagram
    autonumber
    participant Client as REST Client
    participant HTTP as HTTP Server
    participant MCPMgr as MCP Client<br/>Manager
    participant Process as Process<br/>Manager
    participant MCP as MCP Server<br/>(STDIO Process)

    Client->>HTTP: POST /mcp/call
    HTTP->>MCPMgr: callTool(toolName, input)

    MCPMgr->>MCPMgr: Start timeout timer (30s)
    MCPMgr->>Process: Send JSON-RPC request
    Process->>MCP: stdin: {"method": "tools/call", ...}

    activate MCP
    Note over MCP: Long-running operation<br/>(> 30 seconds)

    MCPMgr->>MCPMgr: Timeout timer expires
    MCPMgr->>MCPMgr: Reject promise

    Note over MCPMgr: JSON-RPC Cancel Request<br/>is NOT sent (initial implementation)

    MCPMgr-->>HTTP: TimeoutError
    HTTP-->>Client: 408 Request Timeout<br/>{error: {code: "TIMEOUT_ERROR", ...}}

    Note over MCP: Tool continues executing<br/>(until completion or crash)
    MCP->>Process: stdout: {"result": {...}}
    deactivate MCP

    Note over Process: Response is discarded<br/>(request already timed out)
```

---

## 並行リクエスト処理フロー

```mermaid
sequenceDiagram
    autonumber
    participant Client1 as Client 1
    participant Client2 as Client 2
    participant HTTP as HTTP Server
    participant MCPMgr as MCP Client<br/>Manager
    participant MCP1 as MCP Server 1
    participant MCP2 as MCP Server 2

    par Client 1's request
        Client1->>HTTP: POST /mcp/call<br/>{toolName: "tool1"}
        HTTP->>MCPMgr: callTool("tool1", ...)
        MCPMgr->>MCP1: JSON-RPC (id: 1)
        MCP1->>MCP1: Execute tool1
        MCP1-->>MCPMgr: Response (id: 1)
        MCPMgr-->>HTTP: Result
        HTTP-->>Client1: 200 OK
    and Client 2's request
        Client2->>HTTP: POST /mcp/call<br/>{toolName: "tool2"}
        HTTP->>MCPMgr: callTool("tool2", ...)
        MCPMgr->>MCP2: JSON-RPC (id: 2)
        MCP2->>MCP2: Execute tool2
        MCP2-->>MCPMgr: Response (id: 2)
        MCPMgr-->>HTTP: Result
        HTTP-->>Client2: 200 OK
    end

    Note over HTTP,MCPMgr: Requests are handled concurrently
    Note over MCP1,MCP2: Each MCP Server processes independently
```

---

## 詳細フェーズ説明

### Phase 1: リクエスト検証

**目的**: 不正なリクエストを早期に検出し、セキュリティリスクを軽減

**検証項目**:

1. **Content-Type チェック**: `application/json` であることを確認
2. **JSON パース**: リクエストボディを JSON としてパース
3. **toolName 検証**:
   - 存在確認
   - 正規表現チェック (`/^[a-zA-Z0-9-_]+$/`)
   - 最大長チェック（100文字）
4. **input 検証**:
   - オブジェクト型チェック
   - サイズチェック（100KB）
   - ネスト深さチェック（10階層）
   - Prototype Pollution チェック

**失敗時の動作**: `VALIDATION_ERROR` (400) を返却

---

### Phase 2: MCP Server 確認

**目的**: Tool が実行可能な状態であることを確認

**確認項目**:

1. **Tool 検索**: キャッシュから toolName を検索
2. **Server 状態確認**:
   - `running`: 正常動作中
   - `stopped`: 停止中
   - `crashed`: クラッシュ済み

**失敗時の動作**:

- Tool 未検出 → `TOOL_NOT_FOUND` (404)
- Server 停止中 → `SERVER_NOT_RUNNING` (503)
- Server クラッシュ → `SERVER_CRASHED` (502)

---

### Phase 3: Tools Call (JSON-RPC)

**目的**: MCP Server に Tool 実行を依頼

**処理内容**:

1. **タイムアウトタイマー設定**: config.yaml の timeout 値
2. **JSON-RPC リクエスト生成**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": <unique-id>,
     "method": "tools/call",
     "params": {
       "name": <toolName>,
       "arguments": <input>
     }
   }
   ```
3. **stdin に書き込み**: `message + "\n"` を送信
4. **stdout から読み取り**: レスポンスを1行ずつ読み取り
5. **タイムアウト処理**: 時間内にレスポンスがなければエラー

**失敗時の動作**:

- タイムアウト → `TIMEOUT_ERROR` (408)
- JSON-RPC エラー → エラーコードに応じて 400/404/500

**注意**
実際の JSON-RPC の処理は、SDKが隠蔽していることに注意。

---

### Phase 4: レスポンスパース

**目的**: MCP Server からのレスポンスを検証し、HTTP レスポンスに変換

**処理内容**:

1. **タイムアウトタイマーキャンセル**: 成功時のみ
2. **JSON-RPC レスポンス検証**:
   - `jsonrpc: "2.0"` の確認
   - `id` の一致確認
   - `result` または `error` の存在確認
3. **result のサニタイズ**:
   - サイズチェック（1MB）
   - 型チェック
4. **HTTP レスポンス生成**:
   ```json
   {
     "success": true,
     "result": <sanitized-result>
   }
   ```

---

### Phase 5: 結果返却

**目的**: クライアントに結果を返却

**処理内容**:

1. **HTTPステータスコード設定**: 200 OK
2. **Content-Type 設定**: `application/json`
3. **レスポンスボディ送信**: JSON 文字列

---

## パフォーマンス考慮

### ボトルネック分析

| フェーズ | ボトルネック        | 対策                      |
| -------- | ------------------- | ------------------------- |
| Phase 1  | JSON パース         | 非同期処理、サイズ制限    |
| Phase 2  | キャッシュ検索      | Map による O(1) 検索      |
| Phase 3  | stdin/stdout 通信   | OS のパイプバッファ最適化 |
| Phase 4  | JSON シリアライズ   | サイズ制限、非同期処理    |
| Phase 5  | HTTP レスポンス送信 | ストリーミング            |

### 並行処理

- 各リクエストは独立して処理される
- MCP Server ごとに並行して Tool Call が実行可能
- 同一 Server への複数リクエストは JSON-RPC の `id` で区別

---

## 関連ドキュメント

- [API.md](API.md) - エンドポイント仕様
- [SystemArchitecture.md](SystemArchitecture.md) - コンポーネント構成
- [Security.md](Security.md) - バリデーションとセキュリティ
- [MCPProtocol.md](MCPProtocol.md) - JSON-RPC 通信詳細
- [Configuration.md](Configuration.md) - タイムアウト設定
