# ライブラリの追加方法

## 概要

restexecサンドボックス環境では、コンテナ起動時に利用可能なライブラリが固定されます。しかし、利用者は新しいライブラリを追加してコード実行時に利用することができます。

このドキュメントでは、サンドボックス環境に新しいライブラリを追加する方法を説明します。

## ライブラリ追加の2つの方法

### 方法1: 直接URLインポート

最もシンプルな方法は、TypeScriptコード内でCDN（esm.sh、deno.land/xなど）から直接インポートする方法です。

#### 例：es-toolkitを使用する場合

```typescript
import { range, chunk } from "https://esm.sh/es-toolkit@1.27.0";

async function main() {
    const numbers = range(1, 5); // [1, 2, 3, 4]
    const chunkedArray = chunk(numbers, 2);
    console.log(JSON.stringify({
        success: true,
        result: chunkedArray
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
    }));
    Deno.exit(1);
});
```

#### メリット
- **シンプル**: `import_map.json`の編集が不要
- **明示的**: どのバージョンを使用しているかが一目瞭然
- **即座に利用可能**: 追加設定なしで任意のライブラリを使用できる

#### デメリット
- **冗長**: 同じライブラリを複数のファイルで使う場合、URLを毎回記述する必要がある
- **保守性**: バージョンアップ時に全ファイルを修正する必要がある
- **可読性**: URLが長くなりがち

### 方法2: Import Mapを使用

`import_map.json`を編集して、ライブラリのエイリアスを設定する方法です。

#### 手順

1. `/workspace/import_map.json`を編集します：

```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "types": "/tools/types.ts",
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "es-toolkit/": "https://esm.sh/es-toolkit@1.27.0/"
  }
}
```

2. TypeScriptコードで短いエイリアスを使ってインポートします：

```typescript
import { range, chunk } from "es-toolkit";

async function main() {
    const numbers = range(1, 5); // [1, 2, 3, 4]
    const chunkedArray = chunk(numbers, 2);
    console.log(JSON.stringify({
        success: true,
        result: chunkedArray
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
    }));
    Deno.exit(1);
});
```

#### メリット
- **保守性**: バージョン変更時は`import_map.json`を1箇所修正するだけ
- **可読性**: インポート文がシンプルで読みやすい
- **一元管理**: 使用しているライブラリとバージョンを一元管理できる

#### デメリット
- **初期設定が必要**: `import_map.json`の編集が必要
- **設定ミス**: JSON構文エラーがあると全体が動かなくなる可能性

## ネットワーク権限の設定

外部ライブラリをURLからインポートする場合、Denoにネットワークアクセスを許可する必要があります。

### 環境変数の設定

`DENO_ALLOW_NET`環境変数を設定して、アクセスを許可するドメインを指定します。

#### Docker Composeの場合

`compose.yaml`を編集：

```yaml
services:
  restexec:
    image: restexec:latest
    environment:
      - DENO_ALLOW_NET=esm.sh,deno.land,cdn.jsdelivr.net
    # ...
```

#### Dockerfileの場合

```dockerfile
ENV DENO_ALLOW_NET=esm.sh,deno.land,cdn.jsdelivr.net
```

#### 直接実行の場合

```bash
export DENO_ALLOW_NET=esm.sh,deno.land,cdn.jsdelivr.net
deno run --allow-read=/workspace,/tools --allow-net=esm.sh,deno.land,cdn.jsdelivr.net src/index.ts
```

### セキュリティ上の注意

- **最小権限の原則**: 必要なドメインのみを許可リストに追加してください
- **信頼できるCDNのみ**: 以下のような信頼できるCDNを使用してください
  - `esm.sh` - NPMパッケージのESモジュール版を提供
  - `deno.land/x` - Deno公式のサードパーティモジュールレジストリ
  - `cdn.jsdelivr.net` - CDNサービス
  - `unpkg.com` - NPMのCDN

## 主要なCDNとライブラリソース

### esm.sh

NPMパッケージをESモジュールとして配信するCDNです。

```typescript
// 基本的な使い方
import { functionName } from "https://esm.sh/package-name@version";

// es-toolkit の例
import { range, chunk } from "https://esm.sh/es-toolkit@1.27.0";

// lodash-es の例
import { debounce, throttle } from "https://esm.sh/lodash-es@4.17.21";

// date-fns の例
import { format, addDays } from "https://esm.sh/date-fns@3.0.0";
```

### deno.land/x

Deno専用のサードパーティモジュールレジストリです。

```typescript
// 基本的な使い方
import { functionName } from "https://deno.land/x/module_name@version/mod.ts";

// deno_stdライブラリの例
import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";
```

### CDNの選択基準

| CDN | 対象 | 特徴 |
|-----|------|------|
| esm.sh | NPMパッケージ | NPMの豊富なエコシステムを活用できる |
| deno.land/x | Denoモジュール | Deno専用に最適化されたモジュール |
| cdn.jsdelivr.net | NPM/GitHub | グローバルCDN、高速 |
| unpkg.com | NPMパッケージ | シンプルなNPM CDN |

## 実践例

### 例1: es-toolkitを使った配列処理

`/workspace/import_map.json`:
```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "types": "/tools/types.ts",
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "es-toolkit/": "https://esm.sh/es-toolkit@1.27.0/"
  }
}
```

`/workspace/array-processing.ts`:
```typescript
import { range, chunk, shuffle } from "es-toolkit";

async function main() {
    // 1から100までの数値配列を作成
    const numbers = range(1, 101);

    // 10個ずつのチャンクに分割
    const chunked = chunk(numbers, 10);

    // ランダムにシャッフル
    const shuffled = shuffle(numbers);

    const result = {
        success: true,
        totalNumbers: numbers.length,
        chunksCount: chunked.length,
        firstChunk: chunked[0],
        firstFiveShuffled: shuffled.slice(0, 5)
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

### 例2: date-fnsを使った日付処理

直接URLインポートの例：

```typescript
import { format, addDays, subDays, differenceInDays } from "https://esm.sh/date-fns@3.0.0";

async function main() {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const yesterday = subDays(today, 1);
    const weekAgo = subDays(today, 7);

    const result = {
        success: true,
        today: format(today, 'yyyy-MM-dd'),
        tomorrow: format(tomorrow, 'yyyy-MM-dd'),
        yesterday: format(yesterday, 'yyyy-MM-dd'),
        weekAgo: format(weekAgo, 'yyyy-MM-dd'),
        daysSinceWeekAgo: differenceInDays(today, weekAgo)
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

### 例3: zod を使ったバリデーション

Import Mapを使った例：

`/workspace/import_map.json`:
```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "types": "/tools/types.ts",
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

`/workspace/validation.ts`:
```typescript
import { z } from "zod";

async function main() {
    // スキーマ定義
    const UserSchema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
        email: z.string().email(),
    });

    // バリデーション
    const validData = {
        name: "John Doe",
        age: 30,
        email: "john@example.com"
    };

    const invalidData = {
        name: "",
        age: -5,
        email: "invalid-email"
    };

    try {
        const validResult = UserSchema.parse(validData);
        const invalidResult = UserSchema.parse(invalidData);

        console.log(JSON.stringify({
            success: true,
            validResult,
            invalidResult
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log(JSON.stringify({
                success: true,
                message: "Validation failed as expected",
                errors: error.errors
            }));
        } else {
            throw error;
        }
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

## ベストプラクティス

### 1. バージョンの固定

常に特定のバージョンを指定してください：

```typescript
// 良い例
import { range } from "https://esm.sh/es-toolkit@1.27.0";

// 悪い例（最新版が自動的に使われるため、動作が不安定になる可能性）
import { range } from "https://esm.sh/es-toolkit";
```

### 2. Import Mapの使用を推奨

複数のファイルで同じライブラリを使う場合は、Import Mapを使用してください：

```json
{
  "imports": {
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "date-fns": "https://esm.sh/date-fns@3.0.0",
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

### 3. ネットワーク権限の最小化

必要なドメインのみを許可してください：

```bash
# 良い例
DENO_ALLOW_NET=esm.sh

# 悪い例（すべてのネットワークアクセスを許可）
DENO_ALLOW_NET=
```

### 4. TypeScript型定義の確認

多くのライブラリは型定義を含んでいますが、含まれていない場合は`@types/`パッケージを探してください：

```typescript
// esm.shは自動的に型定義を提供します
import { range } from "https://esm.sh/es-toolkit@1.27.0";

// 型定義を明示的に指定する場合
import type { RangeOptions } from "https://esm.sh/es-toolkit@1.27.0";
```

### 5. エラーハンドリング

外部ライブラリの使用時は、適切なエラーハンドリングを実装してください：

```typescript
import { z } from "https://esm.sh/zod@3.22.4";

async function main() {
    try {
        // ライブラリを使用
        const schema = z.string();
        const result = schema.parse("valid string");

        console.log(JSON.stringify({
            success: true,
            result
        }));
    } catch (error) {
        // ライブラリ固有のエラーをハンドリング
        if (error instanceof z.ZodError) {
            console.error(JSON.stringify({
                success: false,
                error: "Validation error",
                details: error.errors
            }));
        } else {
            console.error(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
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

## よくある問題とトラブルシューティング

### 問題1: ネットワークアクセスが拒否される

**エラー例:**
```
error: Uncaught PermissionDenied: Requires net access to "esm.sh"
```

**解決方法:**
`DENO_ALLOW_NET`環境変数にドメインを追加してください。

```bash
DENO_ALLOW_NET=esm.sh,deno.land
```

### 問題2: Import Mapが読み込まれない

**エラー例:**
```
error: Module not found "es-toolkit"
```

**解決方法:**
1. `/workspace/import_map.json`が存在することを確認
2. JSON構文が正しいことを確認
3. `DENO_IMPORT_MAP`環境変数が正しく設定されていることを確認

### 問題3: 型定義が見つからない

**エラー例:**
```
error: Could not find type definition for module
```

**解決方法:**
esm.shは自動的に型定義を提供しますが、問題がある場合は`@deno-types`ディレクティブを使用してください：

```typescript
// @deno-types="https://esm.sh/v135/@types/lodash-es@4.17.12/index.d.ts"
import { debounce } from "https://esm.sh/lodash-es@4.17.21";
```

### 問題4: バージョンの不一致

**エラー例:**
```
error: Import "https://esm.sh/es-toolkit@1.27.0" has different version than cached
```

**解決方法:**
Denoのキャッシュをクリアしてください：

```bash
deno cache --reload https://esm.sh/es-toolkit@1.27.0
```

## 推奨ライブラリ

以下は、restexecサンドボックス環境で使用できる推奨ライブラリです：

### ユーティリティ
- **es-toolkit**: モダンなユーティリティライブラリ（lodashの代替）
- **ramda**: 関数型プログラミングライブラリ
- **just**: 軽量なユーティリティ関数集

### 日付・時刻
- **date-fns**: 日付操作ライブラリ
- **dayjs**: 軽量な日付ライブラリ

### バリデーション
- **zod**: TypeScript-first なバリデーションライブラリ
- **valibot**: 軽量なバリデーションライブラリ

### データ処理
- **papaparse**: CSV パーサー
- **xlsx**: Excelファイル処理（制限あり）

### 数学・計算
- **mathjs**: 数学ライブラリ
- **decimal.js**: 高精度な小数計算

### 文字列処理
- **nanoid**: ユニークID生成
- **slugify**: URL-friendlyな文字列生成

## まとめ

restexecサンドボックス環境では、以下の方法で新しいライブラリを追加できます：

1. **直接URLインポート**: シンプルで即座に使える
2. **Import Map**: 保守性と可読性が高い

どちらの方法を選択する場合でも：
- ネットワーク権限（`DENO_ALLOW_NET`）の設定が必要
- バージョンを固定することを推奨
- 信頼できるCDNを使用すること

複数のファイルで同じライブラリを使用する場合は、Import Mapの使用を推奨します。

詳細な設定方法については、[Configuration.md](./Configuration.md)と[Security.md](./Security.md)を参照してください。
