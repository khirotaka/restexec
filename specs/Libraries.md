# ライブラリの追加方法

## 概要

restexecサンドボックス環境では、セキュリティ上の理由から実行時に外部ネットワークへのアクセスが制限されています（`--no-remote`フラグ）。そのため、外部ライブラリを使用する場合は、**コンテナビルド時に事前にキャッシュする**必要があります。

このドキュメントでは、新しいライブラリをrestexec環境に追加する方法を説明します。

## 重要な前提

restexecの実行エンジン（`src/executor.ts`）は、Denoを`--no-remote`フラグ付きで起動します：

```typescript
const args = ['run', '--no-prompt', '--no-remote'];
```

これにより：
- **実行時に外部URLから直接インポートできません**
- すべての依存関係は**ビルド時に事前にキャッシュ**する必要があります
- キャッシュされた依存関係のみが実行時に利用可能です

## ライブラリ追加の手順

### ステップ1: deps.tsに依存関係を追加

プロジェクトルートの`deps.ts`ファイルを編集し、使用したいライブラリをインポートします。

```typescript
// deps.ts

// es-toolkit: Modern utility library
export * from "https://esm.sh/es-toolkit@1.27.0";

// date-fns: Date manipulation library
export * from "https://esm.sh/date-fns@3.0.0";

// zod: TypeScript-first validation library
export * from "https://esm.sh/zod@3.22.4";
```

**重要な注意点:**
- 必ず**完全なURL**と**正確なバージョン**を指定してください
- バージョン範囲（`@^1.0.0`など）ではなく、固定バージョン（`@1.27.0`）を使用してください

### ステップ2: import_map.jsonを更新（オプション）

利用者が簡潔なインポートを使えるように、`import_map.json`にエイリアスを追加します。

```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "types": "/tools/types.ts",
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "es-toolkit/": "https://esm.sh/es-toolkit@1.27.0/",
    "date-fns": "https://esm.sh/date-fns@3.0.0",
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

この設定により、ユーザーコードで以下のように簡潔にインポートできます：

```typescript
import { range, chunk } from "es-toolkit";
import { format, addDays } from "date-fns";
import { z } from "zod";
```

### ステップ3: Dockerコンテナを再ビルド

依存関係を追加したら、コンテナを再ビルドしてキャッシュします。

```bash
docker compose build
```

または、Dockerを直接使用する場合：

```bash
docker build -t restexec:latest .
```

ビルド時に、Dockerfileが自動的に`deps.ts`をキャッシュします：

```dockerfile
# Copy external library dependencies file
COPY deps.ts ./

# Cache dependencies (both application and external libraries)
RUN deno cache src/index.ts
RUN deno cache deps.ts
```

### ステップ4: コンテナを起動

再ビルドしたコンテナを起動します：

```bash
docker compose up -d
```

これで、キャッシュされたライブラリが実行時に利用可能になります。

## 使用例

### 例1: es-toolkitを使った配列処理

**deps.ts:**
```typescript
export * from "https://esm.sh/es-toolkit@1.27.0";
```

**import_map.json:**
```json
{
  "imports": {
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0"
  }
}
```

**workspace/array-processing.ts:**
```typescript
import { range, chunk } from "es-toolkit";

async function main() {
    // 1から100までの数値配列を作成
    const numbers = range(1, 101);

    // 10個ずつのチャンクに分割
    const chunked = chunk(numbers, 10);

    const result = {
        success: true,
        totalNumbers: numbers.length,
        chunksCount: chunked.length,
        firstChunk: chunked[0],
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

**deps.ts:**
```typescript
export * from "https://esm.sh/date-fns@3.0.0";
```

**import_map.json:**
```json
{
  "imports": {
    "date-fns": "https://esm.sh/date-fns@3.0.0"
  }
}
```

**workspace/date-operations.ts:**
```typescript
import { format, addDays, subDays, differenceInDays } from "date-fns";

async function main() {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const weekAgo = subDays(today, 7);

    const result = {
        success: true,
        dates: {
            today: format(today, 'yyyy-MM-dd'),
            tomorrow: format(tomorrow, 'yyyy-MM-dd'),
            weekAgo: format(weekAgo, 'yyyy-MM-dd'),
        },
        calculations: {
            daysSinceWeekAgo: differenceInDays(today, weekAgo),
        }
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

### 例3: zodを使ったバリデーション

**deps.ts:**
```typescript
export * from "https://esm.sh/zod@3.22.4";
```

**import_map.json:**
```json
{
  "imports": {
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

**workspace/validation.ts:**
```typescript
import { z } from "zod";

async function main() {
    // スキーマ定義
    const UserSchema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
        email: z.string().email(),
    });

    const data = {
        name: "John Doe",
        age: 30,
        email: "john@example.com"
    };

    try {
        const validResult = UserSchema.parse(data);
        console.log(JSON.stringify({
            success: true,
            validatedData: validResult
        }));
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log(JSON.stringify({
                success: false,
                error: "Validation failed",
                details: error.errors
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

## 主要なCDNとライブラリソース

### esm.sh (推奨)

NPMパッケージをESモジュールとして配信するCDNです。型定義も自動的に提供されます。

```typescript
// 基本的な使い方
import { functionName } from "https://esm.sh/package-name@version";

// es-toolkit
export * from "https://esm.sh/es-toolkit@1.27.0";

// lodash-es
export * from "https://esm.sh/lodash-es@4.17.21";

// date-fns
export * from "https://esm.sh/date-fns@3.0.0";

// zod
export * from "https://esm.sh/zod@3.22.4";
```

### deno.land/x

Deno専用のサードパーティモジュールレジストリです。

```typescript
// 基本的な使い方
import { functionName } from "https://deno.land/x/module_name@version/mod.ts";

// deno_stdライブラリ
export * from "https://deno.land/std@0.210.0/assert/mod.ts";
```

### CDNの選択基準

| CDN | 対象 | 特徴 | 推奨用途 |
|-----|------|------|---------|
| esm.sh | NPMパッケージ | NPMエコシステム、型定義自動提供 | NPMパッケージを使いたい場合 |
| deno.land/x | Denoモジュール | Deno専用に最適化 | Deno専用モジュール |
| cdn.jsdelivr.net | NPM/GitHub | グローバルCDN、高速 | 高速配信が必要な場合 |
| unpkg.com | NPMパッケージ | シンプルなNPM CDN | シンプルなNPMアクセス |

## ベストプラクティス

### 1. バージョンの固定

常に特定のバージョンを指定してください：

```typescript
// 良い例
export * from "https://esm.sh/es-toolkit@1.27.0";

// 悪い例（最新版が自動的に使われるため、ビルドが不安定になる）
export * from "https://esm.sh/es-toolkit";
```

### 2. deps.tsの整理

使用するライブラリをグループ化してコメントを付けることで、保守性を向上させます：

```typescript
// ===== Utility Libraries =====
export * from "https://esm.sh/es-toolkit@1.27.0";
export * from "https://esm.sh/lodash-es@4.17.21";

// ===== Date/Time Libraries =====
export * from "https://esm.sh/date-fns@3.0.0";
export * from "https://esm.sh/dayjs@1.11.10";

// ===== Validation Libraries =====
export * from "https://esm.sh/zod@3.22.4";

// ===== Data Processing =====
export * from "https://esm.sh/papaparse@5.4.1";
```

### 3. Import Mapとdeps.tsの同期

`import_map.json`のURLと`deps.ts`のURLは必ず一致させてください：

```typescript
// deps.ts
export * from "https://esm.sh/es-toolkit@1.27.0";
```

```json
// import_map.json
{
  "imports": {
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0"
  }
}
```

### 4. 段階的な依存関係の追加

多くのライブラリを一度に追加するのではなく、必要なものから段階的に追加してください：

1. 最小限のライブラリで開始
2. 必要に応じて追加
3. 使わなくなったライブラリは削除

### 5. ビルドキャッシュの活用

Dockerのビルドキャッシュを活用するため、`deps.ts`を頻繁に変更しないようにしてください。

## Docker Composeでの使用

`compose.yaml`を使用している場合の完全なワークフロー：

```yaml
# compose.yaml
services:
  restexec:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./example/workspace:/workspace
      - ./example/tools:/tools
    environment:
      - LOG_LEVEL=info
```

**ワークフロー:**

1. `deps.ts`を編集してライブラリを追加
2. `import_map.json`を更新（オプション）
3. コンテナを再ビルド: `docker compose build`
4. コンテナを再起動: `docker compose up -d`
5. ライブラリを使用するコードを`/workspace`に配置
6. API経由でコードを実行

## よくある問題とトラブルシューティング

### 問題1: ライブラリが見つからない

**エラー例:**
```
error: Module not found "https://esm.sh/es-toolkit@1.27.0"
```

**原因:**
- `deps.ts`にライブラリを追加していない
- コンテナを再ビルドしていない

**解決方法:**
1. `deps.ts`にライブラリを追加
2. `docker compose build`で再ビルド
3. `docker compose up -d`で再起動

### 問題2: Import Mapが機能しない

**エラー例:**
```
error: Module not found "es-toolkit"
```

**原因:**
- `import_map.json`の設定が間違っている
- `import_map.json`と`deps.ts`のURLが一致していない

**解決方法:**
1. `import_map.json`のJSON構文を確認
2. `deps.ts`のURLと一致することを確認
3. コンテナを再ビルド

### 問題3: 型定義が見つからない

**エラー例:**
```
error: Could not find type definition for module
```

**解決方法:**

esm.shは自動的に型定義を提供しますが、問題がある場合は`@deno-types`ディレクティブを使用：

```typescript
// @deno-types="https://esm.sh/v135/@types/package-name@version/index.d.ts"
import { functionName } from "https://esm.sh/package-name@version";
```

### 問題4: ビルドが遅い

**原因:**
多数のライブラリをキャッシュしている

**解決方法:**
1. 使用していないライブラリを`deps.ts`から削除
2. Dockerのビルドキャッシュを活用
3. 必要最小限のライブラリのみを追加

### 問題5: キャッシュが更新されない

**原因:**
Dockerのビルドキャッシュが古い

**解決方法:**
```bash
# キャッシュを無効化して再ビルド
docker compose build --no-cache

# または
docker build --no-cache -t restexec:latest .
```

## 推奨ライブラリ

以下は、restexecサンドボックス環境で使用できる推奨ライブラリです：

### ユーティリティ
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| es-toolkit | 1.27.0 | `https://esm.sh/es-toolkit@1.27.0` | モダンなユーティリティライブラリ |
| lodash-es | 4.17.21 | `https://esm.sh/lodash-es@4.17.21` | 関数型ユーティリティライブラリ |
| ramda | 0.29.1 | `https://esm.sh/ramda@0.29.1` | 関数型プログラミング |

### 日付・時刻
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| date-fns | 3.0.0 | `https://esm.sh/date-fns@3.0.0` | 日付操作ライブラリ |
| dayjs | 1.11.10 | `https://esm.sh/dayjs@1.11.10` | 軽量な日付ライブラリ |

### バリデーション
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| zod | 3.22.4 | `https://esm.sh/zod@3.22.4` | TypeScript-first バリデーション |
| valibot | 0.25.0 | `https://esm.sh/valibot@0.25.0` | 軽量なバリデーション |

### データ処理
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| papaparse | 5.4.1 | `https://esm.sh/papaparse@5.4.1` | CSV パーサー |

### 数学・計算
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| mathjs | 12.4.0 | `https://esm.sh/mathjs@12.4.0` | 数学ライブラリ |
| decimal.js | 10.4.3 | `https://esm.sh/decimal.js@10.4.3` | 高精度な小数計算 |

### 文字列処理
| ライブラリ | バージョン | URL | 説明 |
|-----------|----------|-----|------|
| nanoid | 5.0.4 | `https://esm.sh/nanoid@5.0.4` | ユニークID生成 |

## セキュリティ上の注意

### 1. 信頼できるCDNのみを使用

以下のような信頼できるCDNからのみライブラリをインポートしてください：

- ✅ esm.sh
- ✅ deno.land/x
- ✅ cdn.jsdelivr.net
- ✅ unpkg.com

### 2. バージョンの固定

セキュリティパッチが適用されたバージョンを使用し、定期的に更新してください。

### 3. 依存関係の監査

追加するライブラリが信頼できるか、公式ドキュメントやGitHubリポジトリを確認してください。

### 4. 最小権限の原則

必要なライブラリのみを追加し、使用していないライブラリは削除してください。

## まとめ

restexecサンドボックス環境で新しいライブラリを追加する手順：

1. **deps.tsに追加**: 使用したいライブラリを`deps.ts`にインポート
2. **Import Mapを更新**: `import_map.json`にエイリアスを追加（オプション）
3. **コンテナを再ビルド**: `docker compose build`で依存関係をキャッシュ
4. **コンテナを起動**: `docker compose up -d`で新しいコンテナを起動
5. **コードで使用**: ワークスペースのコードでライブラリを使用

**重要なポイント:**
- `--no-remote`フラグにより、実行時に外部ネットワークへのアクセスは制限されています
- すべての依存関係は**ビルド時に事前にキャッシュ**する必要があります
- 必ずバージョンを固定してください
- `deps.ts`と`import_map.json`のURLは一致させてください

詳細な設定方法については、[Configuration.md](./Configuration.md)と[Security.md](./Security.md)を参照してください。
