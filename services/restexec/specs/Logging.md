# ログ仕様

## ログフォーマット

```
[2025-01-09T12:00:00.000Z] [INFO] Server started on port 3000
[2025-01-09T12:00:01.000Z] [INFO] Executing code: test-001 (timeout: 5000ms)
[2025-01-09T12:00:02.234Z] [INFO] Execution completed: test-001 (1234ms)
[2025-01-09T12:00:03.000Z] [ERROR] Execution failed: test-002 - File not found
```

## ログレベル

| レベル | 用途 |
|-------|------|
| **DEBUG** | デバッグ情報、詳細なトレース |
| **INFO** | 一般的な情報、正常な動作 |
| **WARN** | 警告、非致命的なエラー |
| **ERROR** | エラー、例外 |