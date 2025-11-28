# Workspace コード記述ガイド

このドキュメントは、restexecの`/workspace`ディレクトリに配置するTypeScriptコードの記述方法を説明します。
実装の参考となるよう、具体例とパターンを示しています。

## 目次

- [概要](#概要)
- [必須要件](#必須要件)
- [基本パターン](#基本パターン)
- [具体例](#具体例)
- [よくある間違い](#よくある間違い)
- [制約事項](#制約事項)
- [チェックリスト](#チェックリスト)

---

## 概要

### 実行モデル

restexecは、`/workspace`ディレクトリに配置されたTypeScriptファイルを、Denoランタイムで実行します。

```
APIリクエスト → ファイル実行 → 標準出力からJSON取得 → APIレスポンス
```

**重要な特徴:**
- ファイルは**スクリプトとして直接実行**されます（モジュールとしてimportされるわけではありません）
- **標準出力（stdout）に出力されたJSON**が実行結果として返されます
- 標準出力が空の場合、結果は`null`になります

---

## 必須要件

workspaceコードを記述する際、以下の要件を**必ず守る**必要があります。

### 1. JSON形式で結果を出力する

**必須:** `console.log(JSON.stringify(result))` を使用して、JSON形式で結果を標準出力に出力してください。

```typescript
const result = {
  message: "Hello, World!",
  status: "success"
};

// 必須: JSON形式で出力
console.log(JSON.stringify(result));
```

### 2. 正常終了時は終了コード0で終了する

通常の実行では、明示的に`Deno.exit()`を呼ぶ必要はありません。
関数が正常に完了すれば、自動的に終了コード0で終了します。

### 3. エラー時は終了コード1で終了する

エラーが発生した場合、以下のパターンでエラー情報を出力し、`Deno.exit(1)`で終了してください。

```typescript
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

**注意:** `process.exit(1)` ではなく、**`Deno.exit(1)`** を使用してください。

### 4. メイン関数を呼び出す

関数を定義するだけでなく、**必ず実行**してください。

```typescript
async function main() {
  // 処理内容
}

// 関数を呼び出す（重要！）
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

---

## 基本パターン

### テンプレート: 同期処理

```typescript
/**
 * [処理の説明]
 */

function main() {
  // 処理内容
  const result = {
    message: "処理完了",
    data: { /* 計算結果など */ },
    status: "success"
  };

  // JSON形式で出力（必須）
  console.log(JSON.stringify(result));
}

// エラーハンドリング付きで実行
try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  Deno.exit(1);
}
```

### テンプレート: 非同期処理

```typescript
/**
 * [処理の説明]
 */

async function main() {
  // 非同期処理
  const result = {
    message: "処理完了",
    data: { /* 計算結果など */ },
    timestamp: new Date().toISOString(),
    status: "success"
  };

  // JSON形式で出力（必須）
  console.log(JSON.stringify(result));
}

// エラーハンドリング付きで実行
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

---

## 具体例

### 例1: シンプルなHello World

```typescript
/**
 * Hello World Example
 *
 * シンプルな挨拶メッセージを返します。
 */

async function main() {
  const result = {
    message: 'Hello, World!',
    timestamp: new Date().toISOString(),
    status: 'success',
  };

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

**API呼び出し例:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"codeId":"hello-world"}' \
  http://localhost:3000/execute
```

**レスポンス:**
```json
{
  "success": true,
  "result": {
    "message": "Hello, World!",
    "timestamp": "2025-11-09T10:23:15.145Z",
    "status": "success"
  },
  "executionTime": 26
}
```

### 例2: モジュールのインポート

`/tools`ディレクトリにある共有ライブラリをインポートして使用できます。

```typescript
/**
 * Example with Import
 *
 * /toolsディレクトリのユーティリティをインポートして使用する例
 */

import { add, multiply } from 'utils/math.ts';
import { capitalize, reverse } from 'utils/string.ts';

async function main() {
  const num1 = 10;
  const num2 = 5;
  const text = 'hello world';

  const result = {
    math: {
      addition: `${num1} + ${num2} = ${add(num1, num2)}`,
      multiplication: `${num1} × ${num2} = ${multiply(num1, num2)}`,
    },
    string: {
      original: text,
      capitalized: capitalize(text),
      reversed: reverse(text),
    },
    status: 'success',
  };

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

**利用可能なユーティリティ:**
- `utils/math.ts`: 数学関数（add, subtract, multiply, divide, sum, average, max, min）
- `utils/string.ts`: 文字列操作（capitalize, reverse, truncate, slugify, camelCase, snakeCase, kebabCase, isPalindrome, countWords）

**インポート方法:**
```typescript
// import_map.jsonを使用したインポート（推奨）
import { add } from 'utils/math.ts';

// または絶対パスでのインポート
import { add } from '/tools/utils/math.ts';
```

### 例3: 非同期・並列処理

```typescript
/**
 * Async Example
 *
 * 非同期処理と並列実行の例
 */

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchData(id: number): Promise<{ id: number; data: string }> {
  await delay(100);
  return {
    id,
    data: `Data for item ${id}`,
  };
}

async function main() {
  const startTime = Date.now();

  // 並列実行
  const results = await Promise.all([
    fetchData(1),
    fetchData(2),
    fetchData(3),
  ]);

  const endTime = Date.now();
  const duration = endTime - startTime;

  const result = {
    results,
    executionTime: `${duration}ms`,
    status: 'success',
  };

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### 例4: エラーハンドリング

```typescript
/**
 * Error Handling Example
 *
 * エラーを適切に処理する例
 */

async function riskyOperation(value: number): Promise<number> {
  if (value < 0) {
    throw new Error('負の値は処理できません');
  }
  return value * 2;
}

async function main() {
  try {
    const input = -5;
    const output = await riskyOperation(input);

    const result = {
      input,
      output,
      status: 'success',
    };

    console.log(JSON.stringify(result));
  } catch (error) {
    // エラーを適切に処理してJSON形式で出力
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    Deno.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

---

## よくある間違い

### ❌ 間違い1: export defaultパターンを使用

```typescript
// ❌ これは動作しません
export default function main() {
  return {
    message: "Hello"
  };
}
```

**問題点:**
- 関数がexportされるだけで、実行されません
- 標準出力に何も出力されないため、結果は常に`null`になります

**✅ 正しい書き方:**

```typescript
async function main() {
  const result = {
    message: "Hello"
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### ❌ 間違い2: 結果をreturnするだけ

```typescript
// ❌ これは動作しません
async function main() {
  return {
    message: "Hello"
  };
}

main();
```

**問題点:**
- return値は標準出力に出力されません
- 結果は常に`null`になります

**✅ 正しい書き方:**

```typescript
async function main() {
  const result = {
    message: "Hello"
  };

  // console.logで出力する必要があります
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### ❌ 間違い3: JSON.stringify()を忘れる

```typescript
// ❌ これは動作しません
async function main() {
  const result = { message: "Hello" };
  console.log(result);  // オブジェクトをそのまま出力
}
```

**問題点:**
- `[object Object]`という文字列が出力されます
- JSONとしてパースできないため、エラーになります

**✅ 正しい書き方:**

```typescript
async function main() {
  const result = { message: "Hello" };
  console.log(JSON.stringify(result));  // JSON形式で出力
}
```

### ❌ 間違い4: process.exit()を使用

```typescript
// ❌ Denoでは動作しません
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  process.exit(1);  // Node.jsのAPI
});
```

**✅ 正しい書き方:**

```typescript
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);  // DenoのAPI
});
```

### ❌ 間違い5: 関数を定義するだけで呼び出さない

```typescript
// ❌ 関数が実行されません
async function main() {
  const result = { message: "Hello" };
  console.log(JSON.stringify(result));
}

// main()を呼び出していない！
```

**✅ 正しい書き方:**

```typescript
async function main() {
  const result = { message: "Hello" };
  console.log(JSON.stringify(result));
}

// 必ず関数を呼び出す
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

---

## 制約事項

### セキュリティ制限

Denoの権限システムにより、以下の制限があります。

**デフォルトで許可されている操作:**
- ✅ `/workspace`ディレクトリ内のファイル読み込み
- ✅ `/tools`ディレクトリ内のファイル読み込み
- ✅ 標準ライブラリの使用

**デフォルトで禁止されている操作:**
- ❌ ファイルの書き込み（write権限なし）
- ❌ ネットワークアクセス（net権限なし）
- ❌ サブプロセスの実行（run権限なし）
- ❌ `/workspace`と`/tools`以外のファイルへのアクセス

**環境変数へのアクセス:**
- ✅ ユーザー定義の環境変数（リクエストボディの`env`パラメータで指定）
- ✅ システム変数（PATH, DENO_DIRのみ）
- ❌ その他のシステム環境変数

**例:**
```typescript
// ❌ これらは失敗します
await fetch('https://api.example.com/data');  // ネットワーク権限なし
await Deno.writeTextFile('/workspace/output.txt', 'data');  // 書き込み権限なし
await Deno.readTextFile('/etc/passwd');  // アクセス権限なし

// ✅ 環境変数の取得は可能（リクエストで指定した場合）
const apiKey = Deno.env.get('API_KEY');  // リクエストのenvパラメータで指定
```

### タイムアウト制限

**デフォルトタイムアウト:** 5秒（5000ms）
**最大タイムアウト:** 300秒（300000ms）
**最小タイムアウト:** 1ms

タイムアウトを超えた場合、プロセスは強制終了されます。

```typescript
// ❌ 長時間実行される処理は避ける
async function main() {
  // 10秒待機（デフォルトタイムアウト5秒を超える）
  await new Promise(resolve => setTimeout(resolve, 10000));
}
```

**タイムアウトの指定:**
```bash
# APIリクエストでタイムアウトを指定可能
curl -X POST -H "Content-Type: application/json" \
  -d '{"codeId":"my-script", "timeout": 30000}' \
  http://localhost:3000/execute
```

### リソース制限

**標準出力/標準エラー出力のバッファ制限:** 各10MB

巨大な出力を生成すると、バッファオーバーフローエラーになります。

```typescript
// ❌ 巨大な出力は避ける
async function main() {
  const hugeArray = new Array(1000000).fill('data');
  console.log(JSON.stringify(hugeArray));  // バッファ制限を超える可能性
}
```

---

## チェックリスト

コードを生成する際、以下の項目を確認してください。

### 必須項目

- [ ] `console.log(JSON.stringify(result))` で結果を出力している
- [ ] メイン関数を`.catch()`でエラーハンドリングしながら呼び出している
- [ ] エラー時に`Deno.exit(1)`を使用している（`process.exit()`ではない）
- [ ] 関数を定義するだけでなく、実行している

### 推奨項目

- [ ] 出力結果に`status`フィールドを含めている
- [ ] エラーメッセージは分かりやすく記述している
- [ ] TypeScriptの型定義を適切に使用している
- [ ] コメントで処理内容を説明している

### セキュリティ・制約

- [ ] ファイル書き込み操作をしていない
- [ ] ネットワークアクセスをしていない
- [ ] `/workspace`と`/tools`以外のパスにアクセスしていない
- [ ] タイムアウト内に処理が完了する見込みがある
- [ ] 出力サイズが10MB以下である

### パフォーマンス

- [ ] 不要な遅延や待機処理がない
- [ ] 必要に応じて並列処理（`Promise.all`）を使用している
- [ ] 無限ループや終了しない処理がない

---

## 参考ファイル

実際に動作するコード例は、以下のディレクトリで確認できます。

- [example/workspace/hello-world.ts](../example/workspace/hello-world.ts) - シンプルな例
- [example/workspace/with-import.ts](../example/workspace/with-import.ts) - インポートの例
- [example/workspace/async-example.ts](../example/workspace/async-example.ts) - 非同期処理の例
- [example/tools/utils/](../example/tools/utils/) - 利用可能なユーティリティ

詳細な仕様については、以下のドキュメントを参照してください。

- [specs/FileSystem.md](../specs/FileSystem.md) - ファイルシステムの詳細
- [specs/Security.md](../specs/Security.md) - セキュリティモデル
- [CLAUDE.md](../CLAUDE.md) - プロジェクト全体の概要

---

## まとめ

workspaceコードを記述する際の**最重要ポイント**:

1. **`console.log(JSON.stringify(result))`で結果を出力**
2. **関数を定義したら必ず呼び出す**
3. **エラーハンドリングを忘れない**
4. **`Deno.exit(1)`でエラー終了**

これらを守れば、restexecで正しく動作するコードを生成できます。
