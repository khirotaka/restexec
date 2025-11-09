# ファイルシステム構造

## 共有ディレクトリ

```
/workspace/                     # コード実行ディレクトリ
├── exec-20250109-123456.ts    # 実行対象のコード
├── test-001.ts                # テスト用コード
└── sample-calc.ts             # サンプルコード

/tools/                        # 共有ツール・依存関係
├── utils/
│   ├── math.ts               # 数学関数
│   └── string.ts             # 文字列処理
├── mcp-client.ts             # MCP Client (将来的に使用)
└── types.ts                  # 共通型定義
```

## /workspace のコード例

```typescript
// /workspace/test-001.ts
import { formatMessage } from '/tools/utils/string';
import { add, multiply } from '/tools/utils/math';

async function main() {
  const a = 10;
  const b = 20;
  
  const sum = add(a, b);
  const product = multiply(a, b);
  
  const message = formatMessage(`Sum: ${sum}, Product: ${product}`);
  
  // 結果をJSON形式で標準出力に出力
  const result = {
    success: true,
    message,
    calculations: {
      sum,
      product
    },
    timestamp: new Date().toISOString()
  };
  
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
});
```

## /tools のコード例

```typescript
// /tools/utils/math.ts
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
```

```typescript
// /tools/utils/string.ts
export function formatMessage(text: string): string {
  return `[${new Date().toISOString()}] ${text}`;
}
```

