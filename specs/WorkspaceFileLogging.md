# Workspace File Logging Specification

## 概要

`PUT /workspace` エンドポイントでファイルが作成・更新された際に、詳細なファイル情報をログに記録する機能の仕様です。この機能により、ファイル変更履歴の追跡、セキュリティ監査、デバッグの向上を実現します。

## 目的

- ファイルの作成・更新履歴を追跡可能にする
- ファイルの整合性検証（ハッシュ値による）を可能にする
- セキュリティインシデント発生時の調査を支援する
- ファイル変更パターンの分析を可能にする

## Phase 1: 基本ログ機能（初期実装）

### ログ出力タイミング

`PUT /workspace` エンドポイントでファイル保存が**成功した直後**にログを出力します。

### ログレベル

**INFO** レベルで出力します。

### ログ対象情報

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `timestamp` | ISO 8601 string | ファイル保存日時（UTC） | `2025-01-13T10:30:45.123Z` |
| `codeId` | string | コードID | `hello-world` |
| `fileName` | string | ファイル名（拡張子含む） | `hello-world.ts` |
| `filePath` | string | ファイルの絶対パス | `/workspace/hello-world.ts` |
| `fileSize` | number | ファイルサイズ（バイト） | `1234` |
| `sha256` | string | ファイル内容のSHA-256ハッシュ値（16進数） | `e3b0c44298fc1c149afb...` |

### ログフォーマット

#### 構造化ログ（JSON形式）

本番環境や解析目的での使用を想定した構造化ログ形式：

```json
{
  "level": "INFO",
  "timestamp": "2025-01-13T10:30:45.123Z",
  "message": "Workspace file saved",
  "context": {
    "event": "workspace.file.saved",
    "codeId": "hello-world",
    "fileName": "hello-world.ts",
    "filePath": "/workspace/hello-world.ts",
    "fileSize": 1234,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

#### 人間可読形式（テキスト形式）

開発環境での使用を想定した読みやすいテキスト形式：

```
[2025-01-13T10:30:45.123Z] [INFO] Workspace file saved: codeId=hello-world fileName=hello-world.ts size=1234 sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### ログ出力先

- 標準出力（stdout）
- 環境変数 `LOG_FORMAT` により形式を切り替え可能
  - `json`: 構造化ログ（デフォルト）
  - `text`: 人間可読形式

### 実装要件

#### SHA-256ハッシュ計算

Denoの標準ライブラリ `crypto` を使用：

```typescript
import { crypto } from 'jsr:@std/crypto@^1.0.0';

async function calculateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
```

#### タイムスタンプ取得

ISO 8601形式（UTC）で取得：

```typescript
const timestamp = new Date().toISOString();
```

#### ログ出力タイミング

`src/routes/workspace.ts` の以下の箇所でログ出力：

1. ファイル保存成功直後（`Deno.rename()` 実行後）
2. エラー発生時は既存のエラーログを維持

#### パフォーマンス考慮事項

- ハッシュ計算は既にメモリ上にあるコード文字列に対して実行（追加のファイル読み込み不要）
- ハッシュ計算は非同期で実行し、ファイル保存処理と並行化可能
- ログ出力自体は非同期で実行（ブロッキングしない）

### セキュリティ考慮事項

- ログにはファイルの**内容**は含めない（ハッシュ値のみ）
- ハッシュ値により、ファイル内容の改ざん検知が可能
- ログファイルへのアクセス権限は適切に設定する（読み取り専用）

## Phase 2: 拡張ログ機能（将来実装）

### 追加フィールド

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `operation` | `"create"` \| `"update"` | 操作種別 | `"create"` |
| `previousHash` | string \| null | 更新前のSHA-256ハッシュ値（createの場合はnull） | `"a3c5d12..."` or `null` |
| `previousSize` | number \| null | 更新前のファイルサイズ（createの場合はnull） | `1000` or `null` |

### 拡張ログフォーマット例

#### 新規作成時

```json
{
  "level": "INFO",
  "timestamp": "2025-01-13T10:30:45.123Z",
  "message": "Workspace file created",
  "context": {
    "event": "workspace.file.created",
    "operation": "create",
    "codeId": "hello-world",
    "fileName": "hello-world.ts",
    "filePath": "/workspace/hello-world.ts",
    "fileSize": 1234,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "previousHash": null,
    "previousSize": null
  }
}
```

#### 更新時

```json
{
  "level": "INFO",
  "timestamp": "2025-01-13T10:35:50.456Z",
  "message": "Workspace file updated",
  "context": {
    "event": "workspace.file.updated",
    "operation": "update",
    "codeId": "hello-world",
    "fileName": "hello-world.ts",
    "filePath": "/workspace/hello-world.ts",
    "fileSize": 2345,
    "sha256": "f7c8d23498fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999",
    "previousHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "previousSize": 1234
  }
}
```

### 実装要件（Phase 2）

#### 以前のハッシュ値の保存

以下のいずれかの方法で実装：

**オプション A: メモリ内キャッシュ（シンプル）**

```typescript
// Map<codeId, {sha256: string, size: number}>
const fileHashCache = new Map<string, { sha256: string; size: number }>();
```

- メリット: 実装が簡単、高速
- デメリット: サーバー再起動で履歴が消える

**オプション B: ファイルシステム（永続化）**

```typescript
// /workspace/.metadata/{codeId}.json に保存
{
  "sha256": "e3b0c44...",
  "size": 1234,
  "timestamp": "2025-01-13T10:30:45.123Z"
}
```

- メリット: サーバー再起動後も履歴が残る
- デメリット: ファイルI/Oオーバーヘッド

**オプション C: データベース（高度な履歴管理）**

SQLiteなどの軽量データベースを使用：

```sql
CREATE TABLE file_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);
```

- メリット: 完全な履歴管理、クエリ可能
- デメリット: 実装が複雑、依存関係の追加

**推奨**: Phase 2では**オプションB（ファイルシステム）** を推奨します。理由は以下の通り：

1. DenoのファイルシステムAPIで簡単に実装可能
2. データベース依存なしでシンプル
3. 監査目的では永続化が望ましい
4. 将来的にデータベースへの移行も容易

#### 操作種別の判定

```typescript
// ファイル存在チェック（既に実装されている）
let operation: 'create' | 'update';
let previousHash: string | null = null;
let previousSize: number | null = null;

try {
  const existingFileInfo = await Deno.stat(filePath);
  operation = 'update';

  // 既存ファイルのハッシュを取得（メタデータファイルから読み込み）
  const metadata = await loadFileMetadata(codeId);
  if (metadata) {
    previousHash = metadata.sha256;
    previousSize = metadata.size;
  }
} catch {
  operation = 'create';
}
```

## ログ活用例

### 1. ファイル変更履歴の追跡

```bash
# 特定のcodeIdの変更履歴を確認
grep 'codeId=hello-world' logs/workspace.log

# 出力例:
# [2025-01-13T10:30:45.123Z] [INFO] Workspace file created: codeId=hello-world sha256=e3b0c44...
# [2025-01-13T10:35:50.456Z] [INFO] Workspace file updated: codeId=hello-world sha256=f7c8d23...
```

### 2. ファイル整合性の検証

```bash
# 現在のファイルのハッシュ値を計算
sha256sum /workspace/hello-world.ts

# ログに記録されたハッシュ値と比較
grep 'codeId=hello-world' logs/workspace.log | tail -n 1
```

### 3. セキュリティ監査

```bash
# 過去24時間のファイル変更をすべて確認
grep 'Workspace file' logs/workspace.log | grep "$(date -u +%Y-%m-%d)"

# 特定のハッシュ値を持つファイルを検索
grep 'sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' logs/workspace.log
```

### 4. ログ解析（JSON形式の場合）

```bash
# jqを使用してJSON形式のログを解析
cat logs/workspace.log | jq 'select(.context.event == "workspace.file.saved")'

# ファイルサイズの統計
cat logs/workspace.log | jq '.context.fileSize' | awk '{sum+=$1; count++} END {print "Average:", sum/count, "bytes"}'
```

## テスト要件

### ユニットテスト

1. SHA-256ハッシュ計算の正確性
2. ログフォーマットの妥当性（JSON/テキスト）
3. タイムスタンプのISO 8601形式準拠

### 統合テスト

1. ファイル保存時にログが正しく出力される
2. 新規作成とファイル更新で適切なログが出力される
3. エラー時にログが出力されない（既存のエラーログのみ）

### Phase 2テスト

1. `operation` フィールドが正しく設定される（create/update）
2. `previousHash` が更新時に正しく記録される
3. メタデータファイルが正しく保存・読み込まれる

## モニタリング指標

ログから以下の指標を収集可能：

- ファイル保存頻度（時間あたりの保存回数）
- ファイルサイズの分布
- 作成vs更新の比率
- 特定のcodeIdの変更頻度
- ハッシュ値の重複（同じ内容が複数回保存された場合）

## 実装ロードマップ

### Phase 1（初期実装）- 推定工数: 2-3時間

1. SHA-256ハッシュ計算ユーティリティの実装
2. `src/routes/workspace.ts` のログ出力部分の修正
3. ログフォーマット設定（JSON/テキスト）の実装
4. ユニットテスト・統合テストの追加
5. ドキュメント更新（README.md、specs/Logging.md）

### Phase 2（拡張実装）- 推定工数: 4-6時間

1. メタデータファイル管理機能の実装（`/workspace/.metadata/`）
2. `operation` および `previousHash` のログ出力
3. メタデータの読み込み・保存処理
4. Phase 2テストの追加
5. ドキュメント更新

## 互換性

- 既存のログ機能には影響を与えない（追加のみ）
- 既存のAPIレスポンスには変更なし
- ログフォーマットは後方互換性を維持

## 関連ドキュメント

- [specs/WorkspaceSaveAPI.md](./WorkspaceSaveAPI.md) - PUT /workspace APIの仕様
- [specs/Logging.md](./Logging.md) - 全体的なログ仕様
- [specs/Security.md](./Security.md) - セキュリティモデル

---

*最終更新: 2025-01-13*
