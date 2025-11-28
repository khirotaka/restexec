# テストシナリオ

## 1. 正常系テスト

```bash
# 基本的な実行
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId": "test-001"}'

# タイムアウト指定
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId": "test-001", "timeout": 10000}'
```

## 2. 異常系テスト

```bash
# codeId未指定
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{}'

# 存在しないファイル
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId": "nonexistent"}'

# 不正なcodeId（パストラバーサル）
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId": "../etc/passwd"}'

# タイムアウト超過
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId": "infinite-loop", "timeout": 1000}'
```

## 3. パフォーマンステスト

```bash
# 並行実行テスト (10並列)
for i in {1..10}; do
  curl -X POST http://localhost:3000/execute \
    -H "Content-Type: application/json" \
    -d '{"codeId": "test-001"}' &
done
wait
```