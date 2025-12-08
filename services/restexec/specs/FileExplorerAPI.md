# ファイルエクスプローラー API 仕様書

## 概要

ファイルエクスプローラー API は、`/workspace` および `/tools` ディレクトリ内のファイルを探索・検索するための REST エンドポイントを提供します。この API により、外部サービス(別の Pod で実行されている AI Agent など)が、ボリューム共有を必要とせずにファイルシステムをプログラマティックに探索し、ファイルの内容を読み取り、ファイル内のパターンを検索できます。

## 動機

Kubernetes へのデプロイ時、Pod 間でボリュームを共有するには複雑な設定と特定のストレージソリューション(NFS などを使用した ReadWriteMany PVC など)が必要です。ファイル操作を REST API 経由で公開することで、以下のメリットが得られます:

- AI Agent と restexec の Pod 間で共有ボリュームを必要としない
- AI Agent と restexec サービスの独立したスケーリングが可能
- あらゆる Kubernetes 環境で機能する一貫したインターフェースの提供
- API レイヤーでのセキュリティ制御の追加

## API エンドポイント

| メソッド | エンドポイント  | 説明                                                                   |
| -------- | --------------- | ---------------------------------------------------------------------- |
| `GET`    | `/files/list`   | オプションの glob パターンを使用してディレクトリ内のファイルを一覧表示 |
| `GET`    | `/files/read`   | ファイルの内容を読み取る                                               |
| `POST`   | `/files/search` | ファイル内のパターンを検索(grep 風の機能)                              |

---

## エンドポイント: GET /files/list

許可されたパス(`/workspace` または `/tools`)内のファイルとディレクトリを一覧表示します。

### リクエスト

**URL**: `http://localhost:3000/files/list`

**メソッド**: `GET`

**クエリパラメータ**:

| パラメータ      | 型      | 必須   | デフォルト | 説明                                                                                  |
| --------------- | ------- | ------ | ---------- | ------------------------------------------------------------------------------------- |
| `path`          | string  | ✅ Yes | -          | 一覧表示するベースディレクトリパス(`/workspace` または `/tools` 配下である必要がある) |
| `pattern`       | string  | ❌ No  | `*`        | ファイルをフィルタリングする glob パターン(例: `**/*.ts`, `*.json`)                   |
| `maxDepth`      | number  | ❌ No  | 10         | 探索する最大ディレクトリ深度(1-100)                                                   |
| `includeHidden` | boolean | ❌ No  | false      | 隠しファイル(`.` で始まるファイル)を含める                                            |

#### Glob パターンの制約

- **最大長**: 200文字
- **禁止パターン**: 絶対パス（`/` で始まる）、親ディレクトリ参照（`..`）
- **複雑さ制限**: `**` の使用は最大2回まで
- **バリデーション**: パターンが `maxDepth` と整合するかチェック

#### Glob パターンと maxDepth の整合性

- `**` を含むパターン（例: `**/*.ts`）は `maxDepth >= 2` が必要
- `**` が2回含まれる場合（例: `**/foo/**/*.ts`）は `maxDepth >= 3` が必要
- 矛盾する組み合わせの場合は ValidationError を返す

**例**:

```json
// ❌ 無効な組み合わせ
{
  "pattern": "**/*.ts",
  "maxDepth": 1
}

// エラーレスポンス
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Pattern and maxDepth are inconsistent",
    "details": {
      "pattern": "**/*.ts",
      "maxDepth": 1,
      "reason": "Pattern '**' requires maxDepth >= 2"
    }
  }
}
```

#### 400 Bad Request - 無効な glob パターン

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid glob pattern",
    "details": {
      "field": "pattern",
      "value": "../../**/*.ts",
      "reason": "Pattern contains parent directory reference"
    }
  }
}
```

### 使用例

```bash
# /tools 内のすべてのファイルを一覧表示
curl "http://localhost:3000/files/list?path=/tools"

# TypeScript ファイルを再帰的に一覧表示
curl "http://localhost:3000/files/list?path=/tools&pattern=**/*.ts"

# 深度を制限してファイルを一覧表示
curl "http://localhost:3000/files/list?path=/workspace&maxDepth=2"
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "basePath": "/tools",
    "pattern": "**/*.ts",
    "files": [
      {
        "path": "/tools/mcp/client.ts",
        "relativePath": "mcp/client.ts",
        "name": "client.ts",
        "size": 1234,
        "isDirectory": false,
        "modifiedAt": "2025-12-07T10:00:00.000Z"
      },
      {
        "path": "/tools/mcp",
        "relativePath": "mcp",
        "name": "mcp",
        "size": 0,
        "isDirectory": true,
        "modifiedAt": "2025-12-07T09:00:00.000Z"
      }
    ],
    "totalCount": 15,
    "truncated": false
  },
  "executionTime": 42
}
```

#### レスポンスフィールド

| フィールド                    | 型      | 説明                                                                              |
| ----------------------------- | ------- | --------------------------------------------------------------------------------- |
| `result.basePath`             | string  | 一覧表示されたベースディレクトリ                                                  |
| `result.pattern`              | string  | フィルタリングに使用された glob パターン                                          |
| `result.files`                | array   | ファイル/ディレクトリエントリの配列                                               |
| `result.files[].path`         | string  | ファイルへの絶対パス                                                              |
| `result.files[].relativePath` | string  | basePath からの相対パス                                                           |
| `result.files[].name`         | string  | ファイルまたはディレクトリ名                                                      |
| `result.files[].size`         | number  | ファイルサイズ(バイト単位、ディレクトリは 0)                                      |
| `result.files[].isDirectory`  | boolean | エントリがディレクトリかどうか                                                    |
| `result.files[].modifiedAt`   | string  | 最終更新日時(ISO 8601)                                                            |
| `result.totalCount`           | number  | 返されたエントリの総数（`truncated=true` の場合は制限値まで）                     |
| `result.truncated`            | boolean | 結果が制限により切り詰められたかどうか                                            |
| `result.truncatedReason`      | string  | 切り詰められた理由（`truncated=true` の場合のみ）: "max_results" または "timeout" |

#### レスポンス例（切り詰められた場合）

```json
{
  "success": true,
  "result": {
    "basePath": "/tools",
    "pattern": "**/*.ts",
    "files": [...],
    "totalCount": 1000,
    "truncated": true,
    "truncatedReason": "max_results"
  },
  "executionTime": 450
}
```

**ユーザーガイダンス**: 結果が切り詰められた場合の対処方法:

- より具体的な `pattern` を使用して結果を絞り込む
- `maxDepth` を減らして探索範囲を制限する
- 複数のリクエストに分割して探索する

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc/passwd",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 404 Not Found - ディレクトリが見つからない

```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "Directory not found",
    "details": {
      "path": "/tools/nonexistent"
    }
  },
  "executionTime": 1
}
```

---

## エンドポイント: GET /files/read

許可されたパス内のファイルの内容を読み取ります。

### リクエスト

**URL**: `http://localhost:3000/files/read`

**メソッド**: `GET`

**クエリパラメータ**:

| パラメータ | 型     | 必須   | デフォルト | 説明                                                                                                                         |
| ---------- | ------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `path`     | string | ✅ Yes | -          | 読み取るファイルのパス(`/workspace` または `/tools` 配下である必要がある)                                                    |
| `encoding` | string | ❌ No  | `utf-8`    | ファイルエンコーディング(`utf-8`, `base64`)                                                                                  |
| `maxSize`  | number | ❌ No  | 1048576    | 読み取る最大ファイルサイズ(バイト単位、デフォルト: 1MB、最大許容値: 10MB)。10MB を超える値を指定した場合は 10MB に制限される |

**バリデーションルール**:

- `maxSize` は 1 〜 10485760 (10MB) の範囲内である必要があります
- 10MB を超える `maxSize` を指定した場合、自動的に 10MB に切り詰められます
- ファイルサイズが指定した `maxSize` を超える場合は 413 エラーを返します

### 使用例

```bash
# TypeScript ファイルを読み取る
curl "http://localhost:3000/files/read?path=/tools/mcp/client.ts"

# ファイルを base64 として読み取る(バイナリファイル用)
curl "http://localhost:3000/files/read?path=/workspace/data.bin&encoding=base64"
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "path": "/tools/mcp/client.ts",
    "content": "// MCP Client implementation\nexport class MCPClient {\n  ...\n}",
    "size": 1234,
    "encoding": "utf-8",
    "mimeType": "text/typescript",
    "modifiedAt": "2025-12-07T10:00:00.000Z"
  },
  "executionTime": 5
}
```

#### レスポンスフィールド

| フィールド          | 型     | 説明                                                                          |
| ------------------- | ------ | ----------------------------------------------------------------------------- |
| `result.path`       | string | ファイルへの絶対パス                                                          |
| `result.content`    | string | ファイルの内容(UTF-8 テキストまたは base64 エンコード)                        |
| `result.size`       | number | ファイルサイズ(バイト単位)                                                    |
| `result.encoding`   | string | 使用されたコンテンツエンコーディング(`utf-8` または `base64`)                 |
| `result.mimeType`   | string | 検出されたファイルの MIME タイプ（詳細は「MIME タイプ検出」セクションを参照） |
| `result.modifiedAt` | string | 最終更新日時(ISO 8601)                                                        |

#### MIME タイプ検出

MIME タイプはファイル拡張子に基づいて検出されます（magic number の解析は行いません）。

**MIME タイプ検出のアルゴリズム**:

1. ファイル名から最後の `.` 以降を拡張子として抽出
2. 拡張子を小文字に変換（大文字小文字を区別しない）
3. マッピングテーブルと照合
4. マッチしない場合は `application/octet-stream` を返す

**特殊ケース**:

- 複数の拡張子（`.tar.gz`）: 最後の拡張子のみを使用（`.gz` → `application/gzip`）
- 隠しファイル（`.gitignore`）: `.gitignore` 全体をファイル名として扱い、拡張子なしと判定（`application/octet-stream`）
- 拡張子なし（`README`）: `application/octet-stream`
- ドット始まりで拡張子あり（`.env`）: 拡張子なしとして扱い `application/octet-stream`

**サポートされる主要な MIME タイプ**:

| 拡張子          | MIME タイプ                |
| --------------- | -------------------------- |
| `.ts`           | `text/typescript`          |
| `.tsx`          | `text/typescript`          |
| `.js`           | `text/javascript`          |
| `.jsx`          | `text/javascript`          |
| `.json`         | `application/json`         |
| `.md`           | `text/markdown`            |
| `.txt`          | `text/plain`               |
| `.html`         | `text/html`                |
| `.css`          | `text/css`                 |
| `.yaml`, `.yml` | `text/yaml`                |
| `.xml`          | `application/xml`          |
| `.svg`          | `image/svg+xml`            |
| `.png`          | `image/png`                |
| `.jpg`, `.jpeg` | `image/jpeg`               |
| `.gif`          | `image/gif`                |
| `.webp`         | `image/webp`               |
| `.sh`           | `application/x-sh`         |
| `.py`           | `text/x-python`            |
| `.go`           | `text/x-go`                |
| `.rs`           | `text/x-rust`              |
| `.gz`           | `application/gzip`         |
| (その他/不明)   | `application/octet-stream` |

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc/passwd",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 404 Not Found - ファイルが見つからない

```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "File not found",
    "details": {
      "path": "/tools/nonexistent.ts"
    }
  },
  "executionTime": 1
}
```

#### 413 Payload Too Large - ファイルが大きすぎる

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "File size exceeds maximum allowed size",
    "details": {
      "path": "/workspace/large-file.ts",
      "size": 20971520,
      "maxSize": 10485760
    }
  },
  "executionTime": 2
}
```

#### 400 Bad Request - エンコーディングエラー

UTF-8 でデコードできないファイル（バイナリファイルや別のエンコーディング）を `encoding=utf-8` で読み取ろうとした場合:

```json
{
  "success": false,
  "error": {
    "type": "EncodingError",
    "message": "Failed to decode file with specified encoding",
    "details": {
      "path": "/workspace/binary-file.bin",
      "encoding": "utf-8",
      "suggestion": "Try encoding=base64 for binary files"
    }
  },
  "executionTime": 2
}
```

---

## エンドポイント: POST /files/search

ファイル内のパターンを検索します(grep 風の機能)。

### リクエスト

**URL**: `http://localhost:3000/files/search`

**メソッド**: `POST`

**Content-Type**: `application/json`

**リクエストボディ**:

```json
{
  "path": "/tools",
  "pattern": "**/*.ts",
  "query": "export function",
  "isRegex": false,
  "caseInsensitive": true,
  "maxResults": 50,
  "contextLines": 0
}
```

#### パラメータ

| パラメータ        | 型      | 必須   | デフォルト | 説明                                                                                                                                                                                                                        |
| ----------------- | ------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`            | string  | ✅ Yes | -          | 検索するベースディレクトリ                                                                                                                                                                                                  |
| `query`           | string  | ✅ Yes | -          | 検索クエリ(プレーンテキストまたは正規表現)                                                                                                                                                                                  |
| `pattern`         | string  | ❌ No  | `**/*`     | ファイルをフィルタリングする glob パターン                                                                                                                                                                                  |
| `isRegex`         | boolean | ❌ No  | false      | クエリが正規表現パターンかどうか                                                                                                                                                                                            |
| `caseInsensitive` | boolean | ❌ No  | false      | 大文字小文字を区別しない検索                                                                                                                                                                                                |
| `maxResults`      | number  | ❌ No  | 100        | 返されるマッチの最大数(1-500)                                                                                                                                                                                               |
| `contextLines`    | number  | ❌ No  | 0          | マッチの前後のコンテキスト行数(0-5)。以下の計算に基づき最大5行に制限: 最悪ケース（maxResults=500, 各マッチに前後5行ずつ, 1行200文字）で約 500 * (1+10) * 200 = 1.1MB となり、マッチ本文を含めても10MB以内に収まることを保証 |

### 使用例

```bash
# TypeScript ファイル内で "export function" を検索
curl -X POST http://localhost:3000/files/search \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tools",
    "pattern": "**/*.ts",
    "query": "export function",
    "caseInsensitive": true
  }'

# import 文を正規表現で検索
curl -X POST http://localhost:3000/files/search \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace",
    "query": "import\\s+\\{[^}]+\\}\\s+from",
    "isRegex": true,
    "maxResults": 50
  }'
```

### 成功レスポンス (200 OK)

```json
{
  "success": true,
  "result": {
    "query": "export function",
    "isRegex": false,
    "caseInsensitive": true,
    "matches": [
      {
        "file": "/tools/mcp/client.ts",
        "relativePath": "mcp/client.ts",
        "lineNumber": 10,
        "columnStart": 0,
        "columnEnd": 15,
        "lineContent": "export function callTool(name: string, args: unknown) {",
        "contextBefore": [],
        "contextAfter": []
      },
      {
        "file": "/tools/utils/math.ts",
        "relativePath": "utils/math.ts",
        "lineNumber": 5,
        "columnStart": 0,
        "columnEnd": 15,
        "lineContent": "export function add(a: number, b: number): number {",
        "contextBefore": [],
        "contextAfter": []
      }
    ],
    "totalMatches": 23,
    "filesSearched": 15,
    "filesWithMatches": 8,
    "truncated": false
  },
  "executionTime": 150
}
```

#### レスポンスフィールド

| フィールド                       | 型      | 説明                                               |
| -------------------------------- | ------- | -------------------------------------------------- |
| `result.query`                   | string  | 使用された検索クエリ                               |
| `result.isRegex`                 | boolean | 正規表現モードが使用されたかどうか                 |
| `result.caseInsensitive`         | boolean | 大文字小文字を区別しないモードが使用されたかどうか |
| `result.matches`                 | array   | マッチ結果の配列                                   |
| `result.matches[].file`          | string  | ファイルへの絶対パス                               |
| `result.matches[].relativePath`  | string  | 検索ベースからの相対パス                           |
| `result.matches[].lineNumber`    | number  | マッチの行番号(1 から始まる)                       |
| `result.matches[].columnStart`   | number  | マッチの開始列(0 から始まる)                       |
| `result.matches[].columnEnd`     | number  | マッチの終了列(0 から始まる)                       |
| `result.matches[].lineContent`   | string  | マッチした行の完全な内容                           |
| `result.matches[].contextBefore` | array   | マッチの前の行(contextLines > 0 の場合)            |
| `result.matches[].contextAfter`  | array   | マッチの後の行(contextLines > 0 の場合)            |
| `result.totalMatches`            | number  | 見つかったマッチの総数                             |
| `result.filesSearched`           | number  | 検索されたファイル数                               |
| `result.filesWithMatches`        | number  | 少なくとも 1 つのマッチを含むファイル数            |
| `result.truncated`               | boolean | 結果が切り詰められたかどうか                       |
| `result.warnings`                | array   | 検索中に発生した警告の配列（オプション）           |
| `result.warnings[].type`         | string  | 警告タイプ（例: "RegexTimeout"）                   |
| `result.warnings[].file`         | string  | 警告が発生したファイルパス                         |
| `result.warnings[].message`      | string  | 警告メッセージ                                     |

#### レスポンス例（正規表現タイムアウト発生時）

```json
{
  "success": true,
  "result": {
    "query": "complex.*pattern",
    "matches": [...],
    "totalMatches": 15,
    "warnings": [
      {
        "type": "RegexTimeout",
        "file": "/tools/large-file.ts",
        "message": "Regex matching timed out after 5 seconds, file skipped"
      }
    ]
  },
  "executionTime": 8500
}
```

### エラーレスポンス

#### 400 Bad Request - 無効なパス

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Path must be under /workspace or /tools",
    "details": {
      "field": "path",
      "value": "/etc",
      "allowedPaths": ["/workspace", "/tools"]
    }
  },
  "executionTime": 1
}
```

#### 400 Bad Request - 無効な正規表現

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid regex pattern",
    "details": {
      "field": "query",
      "value": "[invalid(",
      "reason": "Unterminated character class"
    }
  },
  "executionTime": 1
}
```

#### 408 Request Timeout - 検索タイムアウト

```json
{
  "success": false,
  "error": {
    "type": "TimeoutError",
    "message": "Search operation timed out",
    "details": {
      "timeout": 30000,
      "filesSearched": 150,
      "partialMatches": 45
    }
  },
  "executionTime": 30001
}
```

---

## セキュリティ上の考慮事項

### パストラバーサル防止

すべてのファイル操作は厳格なパス検証を実施します:

1. **許可されたベースパス**: `/workspace` および `/tools` ディレクトリのみがアクセス可能
2. **パス正規化**: `..` および `.` コンポーネントを解決するためにパスを正規化
3. **シンボリックリンクの解決**: シンボリックリンクを解決し、許可されたパスに対して検証
4. **隠しファイル制御**: デフォルトで隠しファイルを除外

**詳細なパス検証フロー**:

```typescript
import * as path from '@std/path';

function validatePath(requestedPath: string): string {
  // 1. 入力パスの正規化（相対パス解決）
  const normalizedPath = path.normalize(requestedPath);

  // 2. 初期バリデーション：許可されたパスで始まるか
  const allowedPaths = [config.workspaceDir, config.toolsDir];
  if (!allowedPaths.some((allowed) => normalizedPath.startsWith(allowed))) {
    throw new ValidationError('Path must be under /workspace or /tools');
  }

  // 3. パスの存在確認
  let realPath: string;
  try {
    realPath = Deno.realPathSync(normalizedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new FileNotFoundError('Path not found');
    }
    throw error;
  }

  // 4. シンボリックリンク解決後の再検証
  if (!allowedPaths.some((allowed) => realPath.startsWith(allowed))) {
    throw new ValidationError('Resolved path is outside allowed directories');
  }

  return realPath;
}
```

**セキュリティ上の注意点**:

- TOCTOU (Time-of-check to time-of-use) 競合状態のリスクを最小限にするため、検証後すぐにファイル操作を実行
- シンボリックリンクは解決後に再度検証し、外部ディレクトリへのエスケープを防止

**TOCTOU リスクの軽減策**:

1. **検証とファイル操作の原子化**: 検証関数内で直接ファイルハンドルを開き、そのハンドルを返す

```typescript
function openValidatedFile(requestedPath: string): Deno.FsFile {
  const realPath = validatePath(requestedPath); // 検証
  // 検証直後にファイルを開く（間に他の操作を挟まない）
  try {
    return Deno.openSync(realPath, { read: true });
  } catch (error) {
    throw new FileAccessError('Failed to open validated file');
  }
}
```

2. **検証結果のキャッシュ禁止**: パス検証結果は決してキャッシュせず、リクエストごとに再検証

3. **ファイルディスクリプタベースの操作**: 可能な限り、パス文字列ではなくファイルディスクリプタを使用して操作

4. **制限事項の明記**: 完全な TOCTOU 防止は不可能であることを認識し、追加の防御層（NetworkPolicy、認証）と組み合わせる

**注意**: この対策は TOCTOU リスクを「最小限」にするものであり、完全に排除するものではありません。Kubernetes 環境では、攻撃者が同一 Pod 内でシンボリックリンクを変更できる状況は想定していません（そのような状況ではすでにセキュリティ境界が突破されています）。

### リソース制限

| リソース             | 制限  | 説明                                       |
| -------------------- | ----- | ------------------------------------------ |
| ファイルサイズ       | 10 MB | 読み取り操作の最大ファイルサイズ           |
| ディレクトリ深度     | 100   | 再帰的一覧表示の最大深度                   |
| 一覧結果             | 1000  | 一覧表示操作で返される最大ファイル数       |
| 検索結果             | 500   | 検索操作で返される最大マッチ数             |
| 検索タイムアウト     | 30 秒 | 検索操作の最大時間                         |
| 正規表現タイムアウト | 5 秒  | ファイルごとの正規表現マッチングの最大時間 |

### 同時実行制御

複数のクライアントからの同時リクエストによるリソース枯渇を防ぐため、同時実行数を制限します:

| 制限項目                   | 制限値 | 説明                                          |
| -------------------------- | ------ | --------------------------------------------- |
| 最大同時検索リクエスト数   | 5      | `/files/search` の同時実行数上限              |
| 最大同時ファイル読み取り数 | 10     | `/files/read` の同時実行数上限                |
| リクエストキュー待機時間   | 10 秒  | 上限到達時の最大待機時間、超過時は 429 エラー |

#### 429 Too Many Requests エラー

```json
{
  "success": false,
  "error": {
    "type": "RateLimitError",
    "message": "Too many concurrent requests",
    "details": {
      "operation": "search",
      "limit": 5,
      "retryAfter": 3
    }
  },
  "executionTime": 1
}
```

### 正規表現のセキュリティ

ReDoS (Regular Expression Denial of Service) 攻撃を防ぐために、以下の対策を実施します:

#### 1. 正規表現の複雑さ制限

| 制限項目                   | 制限値 | 説明                         |
| -------------------------- | ------ | ---------------------------- |
| ネストされた量指定子の深度 | 3      | 例: `(a+)+` はネスト深度 2   |
| パターンの最大長           | 500    | 正規表現パターンの最大文字数 |
| キャプチャグループの最大数 | 20     | `()` の最大数                |
| 文字クラスの最大サイズ     | 100    | `[...]` 内の文字の最大数     |

#### 2. 危険なパターンの拒否

以下のようなバックトラッキングを引き起こす可能性のあるパターンは事前検証で拒否されます:

```
# 拒否されるパターンの例
(a+)+$         # ネストされた量指定子
(a|aa)+        # 重複するオルタネーション
.*.*.*.*       # 連続したワイルドカード
(.+)+          # 任意文字のネスト
```

#### 危険なパターンの検出方法

完全な静的解析は困難なため、以下の複合的なアプローチを使用します：

**1. ヒューリスティック検出**:

```typescript
function isDangerousPattern(pattern: string): boolean {
  // ネストされた量指定子の検出（簡易版）
  const nestedQuantifiers = /(\+|\*|\{[0-9,]+\})\s*(\+|\*|\{[0-9,]+\})/;
  if (nestedQuantifiers.test(pattern)) {
    return true;
  }

  // 連続した .* の検出
  if (/(\.\*){3,}/.test(pattern)) {
    return true;
  }

  // オルタネーションの重複パターン
  if (/\([^)]*\|[^)]*\)\+/.test(pattern)) {
    return true;
  }

  return false;
}
```

**2. 制限値による間接的な防御**:

- パターンの最大長: 500文字
- キャプチャグループの最大数: 20個
- 文字クラスの最大サイズ: 100文字

**3. ランタイムタイムアウト**:

- 各ファイルに対して5秒のタイムアウト
- タイムアウト時はそのファイルをスキップし、警告を返す

**4. 既知の危険パターンのブラックリスト**:

```typescript
const BLOCKED_PATTERNS = [
  /\(.*\+\)\+/, // (a+)+
  /\(.*\*\)\*/, // (a*)*
  /\(.*\+\)\*/, // (a+)*
  /\(.*\|\.\*\)\+/, // (a|.*)+
];
```

**制限事項**:

- すべての ReDoS パターンを事前に検出することは不可能
- 複雑で安全なパターンが誤って拒否される可能性がある（偽陽性）
- 主な防御はランタイムタイムアウトに依存

**トレードオフ**: 厳格な検証は柔軟性を損なうため、実装時には偽陽性率と偽陰性率のバランスを考慮してください。

#### 400 Bad Request - 正規表現が複雑すぎる

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Regex pattern is too complex",
    "details": {
      "field": "query",
      "value": "(a+)+$",
      "reason": "Nested quantifiers detected (max depth: 3)",
      "suggestion": "Simplify the pattern or use non-capturing groups"
    }
  },
  "executionTime": 1
}
```

---

## エラータイプ

| エラータイプ              | HTTP ステータス | 説明                                     |
| ------------------------- | --------------- | ---------------------------------------- |
| `ValidationError`         | 400             | 無効なリクエストパラメータ               |
| `EncodingError`           | 400             | ファイルのエンコーディングエラー         |
| `FileNotFoundError`       | 404             | ファイルまたはディレクトリが見つからない |
| `TimeoutError`            | 408             | 操作がタイムアウト                       |
| `RateLimitError`          | 429             | 同時リクエスト数の上限に達した           |
| `InternalError`           | 500             | サーバー内部エラー                       |
| `ServiceUnavailableError` | 503             | 機能が無効化されている                   |

---

## 設定

ファイルエクスプローラー API は以下の環境変数を考慮します:

| 変数                           | デフォルト   | 説明                                     |
| ------------------------------ | ------------ | ---------------------------------------- |
| `WORKSPACE_DIR`                | `/workspace` | ワークスペースディレクトリパス           |
| `TOOLS_DIR`                    | `/tools`     | ツールディレクトリパス                   |
| `FILE_EXPLORER_ENABLED`        | `true`       | ファイルエクスプローラー API の有効/無効 |
| `FILE_EXPLORER_MAX_FILE_SIZE`  | `10485760`   | 読み取りの最大ファイルサイズ(バイト)     |
| `FILE_EXPLORER_MAX_RESULTS`    | `1000`       | 一覧/検索の最大結果数                    |
| `FILE_EXPLORER_SEARCH_TIMEOUT` | `30000`      | 検索操作のタイムアウト(ミリ秒)           |

### 機能無効化時の動作

`FILE_EXPLORER_ENABLED=false` に設定した場合、すべての File Explorer API エンドポイント(`/files/*`)は以下のレスポンスを返します:

#### 503 Service Unavailable - 機能が無効化されている

```json
{
  "success": false,
  "error": {
    "type": "ServiceUnavailableError",
    "message": "File Explorer API is disabled",
    "details": {
      "feature": "file-explorer",
      "enableKey": "FILE_EXPLORER_ENABLED"
    }
  },
  "executionTime": 1
}
```

**注意**: この設定はセキュリティ要件や運用ポリシーに基づいて、File Explorer API を完全に無効化する必要がある場合に使用します。

---

## 既存 API との統合

### ワークフロー: AI Agent のファイル探索

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AI Agent ワークフロー                                                    │
│                                                                         │
│  前提: すべてのリクエストに Authorization ヘッダーが必要                   │
│  Authorization: Bearer <RESTEXEC_API_KEY>                               │
│                                                                         │
│  1. GET /files/list?path=/tools&pattern=**/*.ts                         │
│     └─ 利用可能なツールを発見                                            │
│                                                                         │
│  2. GET /files/read?path=/tools/mcp/client.ts                          │
│     └─ ツールのソースコードを読み取る                                     │
│                                                                         │
│  3. POST /files/search                                                  │
│     └─ 特定の関数やパターンを検索                                        │
│                                                                         │
│  4. PUT /workspace                                                      │
│     └─ 生成された TypeScript コードを保存                                │
│                                                                         │
│  5. POST /execute                                                       │
│     └─ 保存されたコードを実行                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

**使用例（認証付き）**:

```bash
# ファイル一覧を取得（認証付き）
curl -H "Authorization: Bearer ${RESTEXEC_API_KEY}" \
  "http://localhost:3000/files/list?path=/tools&pattern=**/*.ts"
```

### 既存エンドポイントとの連携

| エンドポイント   | 統合                                               |
| ---------------- | -------------------------------------------------- |
| `PUT /workspace` | ファイルエクスプローラーで発見したコードを保存     |
| `POST /execute`  | ファイルエクスプローラーでレビュー後にコードを実行 |
| `POST /lint`     | 実行前にコードをリント                             |
| `GET /health`    | サービスの可用性を監視                             |

---

## テストの考慮事項

### 単体テスト

1. パス検証(トラバーサル防止)
2. glob パターンマッチング
3. **glob パターンのバリデーション（複雑さ、禁止パターン）**
4. 様々なエンコーディングでのファイル読み取り
5. エッジケースを含む正規表現検索
6. リソース制限の適用
7. **隠しファイルのフィルタリング（`includeHidden=false` のデフォルト動作）**
8. **MIME タイプ検出の正確性（各拡張子のマッピング）**

### 統合テスト

1. 一覧表示 → 読み取り → 検索のワークフロー
2. 大量のファイルセットでの検索
3. 同時アクセスの処理
4. エラー処理と復旧

### セキュリティテスト

1. パストラバーサルの試行(`../../../etc/passwd`)
2. シンボリックリンクのエスケープ
   - **許可されたパス内のシンボリックリンクから外部へのリンク**
   - **外部から許可されたパスへのシンボリックリンク（逆方向）**
   - **チェイン化されたシンボリックリンク（A→B→外部）**
3. ReDoS パターン
4. 大きなファイル攻撃
5. 隠しファイルへのアクセス
   - **`includeHidden=false` での `.env` へのアクセス試行**
   - **明示的な隠しファイルパスでの読み取り試行**
6. **glob パターンによるDoS攻撃（`**/**/**/**/**/*.ts`）**
7. **同時実行制限のバイパス試行**
8. **正規表現タイムアウトのテスト（複雑なパターン + 大きなファイル）**

---

## 今後の拡張

1. **ストリーミングサポート**: チャンク転送による大きなファイルコンテンツのストリーミング
2. **ファイル監視**: WebSocket ベースのファイル変更通知
3. **キャッシング**: より高速な一覧表示のためのファイルメタデータのキャッシュ
4. **圧縮**: 大きなレスポンスの gzip 圧縮サポート
5. **ファイル差分**: 2 つのファイルを比較して差分を返す
6. **シンタックスハイライト**: コードファイルのオプションのシンタックスハイライト
