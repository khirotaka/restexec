# 認証・認可仕様書

## 概要

restexec サービスは、AI Agent からのリクエストを認証し、不正なアクセスから保護するための認証・認可機能を提供します。本仕様書では、API Key 認証と Kubernetes NetworkPolicy を組み合わせた多層防御アプローチを定義します。

## 動機

restexec サービスは以下のセキュリティリスクを持っています:

| リスク                 | 影響                                        | 対策                    |
| ---------------------- | ------------------------------------------- | ----------------------- |
| 不正なファイルアクセス | `/tools` や `/workspace` の機密コードが漏洩 | API Key 認証            |
| 任意コード実行         | `/execute` エンドポイントを悪用した攻撃     | API Key 認証            |
| Pod 間通信の傍受       | クラスタ内の他 Pod からの不正アクセス       | NetworkPolicy           |
| なりすまし             | 正規の AI Agent を装った攻撃                | API Key + NetworkPolicy |

## セキュリティアーキテクチャ

### 多層防御モデル

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        多層防御アーキテクチャ                               │
│                                                                         │
│   Layer 1: Kubernetes NetworkPolicy                                     │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  ・Pod ラベルに基づくアクセス制御                                    │   │
│   │  ・許可された Pod からのみ通信を受け入れ                              │   │
│   │  ・Namespace 分離                                                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│   Layer 2: API Key 認証                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  ・Bearer トークンによる認証                                        │   │
│   │  ・タイミングセーフな比較                                            │   │
│   │  ・認証失敗時のレート制限                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│   Layer 3: エンドポイント認可                                              │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  ・エンドポイントごとの認証要否設定                                    │   │
│   │  ・ヘルスチェックは認証不要                                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## API Key 認証

### 認証フロー

```
┌─────────────────┐                              ┌─────────────────┐
│   AI Agent      │                              │   restexec      │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. HTTP Request                               │
         │     Authorization: Bearer <api-key>            │
         │───────────────────────────────────────────────▶│
         │                                                │
         │                          2. トークン検証         │
         │                             ├─ 形式チェック      │
         │                             └─ 値の比較         │
         │                                                │
         │  3a. 成功: 200 OK + レスポンス                   │
         │◀───────────────────────────────────────────────│
         │                                                │
         │  3b. 失敗: 401 Unauthorized                     │
         │◀───────────────────────────────────────────────│
         │                                                │
```

### リクエスト形式

すべての認証が必要なリクエストには `Authorization` ヘッダーを含める必要があります。

**ヘッダー形式**:

```http
Authorization: Bearer <api-key>
```

**リクエスト例**:

```bash
# 環境変数からAPIキーを取得して使用
curl -X GET "http://restexec:3000/files/list?path=/tools" \
  -H "Authorization: Bearer ${RESTEXEC_API_KEY}" \
  -H "Content-Type: application/json"
```

```bash
# コード実行
curl -X POST "http://restexec:3000/execute" \
  -H "Authorization: Bearer ${RESTEXEC_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"codeId": "my-script", "timeout": 5000}'
```

### API Key の要件

| 要件       | 値                   | 説明                               |
| ---------- | -------------------- | ---------------------------------- |
| 最小長     | 32文字               | セキュリティのため十分な長さが必要 |
| 推奨長     | 64文字               | 256ビットエントロピー相当          |
| 文字セット | Base64               | `[A-Za-z0-9+/=]`                   |
| 生成方法   | 暗号学的に安全な乱数 | `crypto.randomBytes()` または同等  |

**API Key 生成例**:

```bash
# Linux/macOS
openssl rand -base64 48
# 出力例: xK9mN2pL5qR8sT1uV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN1oP4qR7sT0uV3wX6yZ

# Deno
deno eval "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

### 認証が必要なエンドポイント

| エンドポイント  | メソッド | 認証    | 理由                                    |
| --------------- | -------- | ------- | --------------------------------------- |
| `/execute`      | POST     | ✅ 必須 | 任意コード実行のリスク                  |
| `/workspace`    | PUT      | ✅ 必須 | ファイル書き込みのリスク                |
| `/lint`         | POST     | ✅ 必須 | リソース消費                            |
| `/files/list`   | GET      | ✅ 必須 | ファイル情報の漏洩リスク                |
| `/files/read`   | GET      | ✅ 必須 | ファイル内容の漏洩リスク                |
| `/files/search` | POST     | ✅ 必須 | ファイル内容の漏洩リスク + リソース消費 |
| `/health`       | GET      | ❌ 不要 | Kubernetes プローブ/監視用              |

### エラーレスポンス

#### 401 Unauthorized - 認証ヘッダーがない

```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "Missing Authorization header",
    "details": {
      "hint": "Include 'Authorization: Bearer <api-key>' header"
    }
  },
  "executionTime": 1
}
```

#### 401 Unauthorized - 認証形式が不正

```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "Invalid Authorization header format",
    "details": {
      "expected": "Bearer <api-key>",
      "received": "Basic ..."
    }
  },
  "executionTime": 1
}
```

#### 401 Unauthorized - API Key が無効

```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "Invalid API key"
  },
  "executionTime": 1
}
```

**セキュリティ上の注意**: API Key が無効な場合、詳細な理由（キーが短い、一部一致など）は返しません。これは情報漏洩を防ぐためです。

---

## 設定

### 環境変数

| 変数                           | デフォルト | 説明                                                      |
| ------------------------------ | ---------- | --------------------------------------------------------- |
| `AUTH_ENABLED`                 | `false`    | 認証機能の有効/無効（本番環境では必ず `true` にすること） |
| `AUTH_API_KEY`                 | (なし)     | API Key（`AUTH_ENABLED=true` の場合は必須）               |
| `AUTH_RATE_LIMIT_ENABLED`      | `true`     | 認証失敗時のレート制限                                    |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | `5`        | レート制限までの最大試行回数                              |
| `AUTH_RATE_LIMIT_WINDOW_MS`    | `60000`    | レート制限のウィンドウ期間（ミリ秒）                      |
| `AUTH_RATE_LIMIT_TRUST_PROXY`  | `false`    | `X-Forwarded-For` ヘッダーを信頼するかどうか              |

**注意**: `AUTH_ENABLED` が未設定の場合、起動時に以下の警告ログが出力されます:

```
[WARN] AUTH_ENABLED is not explicitly set. Defaulting to false. This is NOT recommended for production.
```

### 起動時のバリデーション

`AUTH_ENABLED=true` の場合、以下のバリデーションが起動時に実行されます:

1. `AUTH_API_KEY` が設定されているか確認
2. `AUTH_API_KEY` が最小長（32文字）を満たしているか確認
3. 条件を満たさない場合、サーバーは起動を拒否してエラーを出力

**起動エラー例**:

```
[ERROR] AUTH_ENABLED is true but AUTH_API_KEY is not set
[ERROR] AUTH_API_KEY must be at least 32 characters long (current: 16)
```

---

## Kubernetes での設定

### Secret の作成

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: restexec-api-key
  namespace: restexec
type: Opaque
stringData:
  api-key: 'xK9mN2pL5qR8sT1uV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN1oP4qR7sT0uV3wX6yZ'
```

**注意**: 本番環境では、Secret を直接 YAML ファイルに記載せず、以下の方法を使用してください:

```bash
# Secret をコマンドラインから作成
kubectl create secret generic restexec-api-key \
  --namespace restexec \
  --from-literal=api-key="$(openssl rand -base64 48)"
```

### Deployment への適用

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: restexec
  namespace: restexec
spec:
  template:
    spec:
      containers:
        - name: restexec
          env:
            - name: AUTH_ENABLED
              value: 'true'
            - name: AUTH_API_KEY
              valueFrom:
                secretKeyRef:
                  name: restexec-api-key
                  key: api-key

        # AI Agent サイドカー（同一 Pod 内の場合）
        - name: ai-agent
          env:
            - name: RESTEXEC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: restexec-api-key
                  key: api-key
            - name: RESTEXEC_URL
              value: 'http://localhost:3000'
```

### 別 Pod での AI Agent の場合

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent
  namespace: restexec
spec:
  template:
    metadata:
      labels:
        app: ai-agent # NetworkPolicy で使用
    spec:
      containers:
        - name: ai-agent
          env:
            - name: RESTEXEC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: restexec-api-key
                  key: api-key
            - name: RESTEXEC_URL
              value: 'http://restexec:3000'
```

---

## Kubernetes NetworkPolicy

### 基本ポリシー

restexec Pod への Ingress を制限し、許可された Pod からのみアクセスを許可します。

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restexec-ingress
  namespace: restexec
spec:
  podSelector:
    matchLabels:
      app: restexec
  policyTypes:
    - Ingress
  ingress:
    # ai-agent Pod からのアクセスを許可
    - from:
        - podSelector:
            matchLabels:
              app: ai-agent
      ports:
        - protocol: TCP
          port: 3000

    # Prometheus/監視システムからのヘルスチェック（オプション）
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
          podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 3000
```

### 厳格なポリシー（本番環境向け）

すべての通信を明示的に許可する必要がある厳格なポリシー。

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restexec-strict
  namespace: restexec
spec:
  podSelector:
    matchLabels:
      app: restexec
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # ai-agent からのみ許可
    - from:
        - podSelector:
            matchLabels:
              app: ai-agent
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # DNS 解決を許可
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53

    # 外部への通信を禁止（明示的なルールがない限り）
```

### サイドカーパターンの場合

同一 Pod 内でサイドカーとして動作する場合、localhost 通信は NetworkPolicy の対象外となりますが、API Key 認証は引き続き適用されます。

```yaml
# サイドカーパターンでは NetworkPolicy は不要
# ただし、外部からの不正アクセスを防ぐため、
# Service を ClusterIP として公開しないことを推奨
apiVersion: v1
kind: Service
metadata:
  name: restexec
  namespace: restexec
spec:
  type: ClusterIP # NodePort や LoadBalancer を使用しない
  selector:
    app: restexec
  ports:
    - port: 3000
      targetPort: 3000
```

---

## Docker Compose での設定

### 環境変数ファイル

```bash
# .env
RESTEXEC_API_KEY=xK9mN2pL5qR8sT1uV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN1oP4qR7sT0uV3wX6yZ
```

### compose.yaml

```yaml
services:
  restexec:
    image: restexec:latest
    environment:
      - AUTH_ENABLED=true
      - AUTH_API_KEY=${RESTEXEC_API_KEY}
    networks:
      - internal
    # ポートを外部に公開しない
    # ports:
    #   - "3000:3000"  # 本番環境ではコメントアウト

  ai-agent:
    image: ai-agent:latest
    environment:
      - RESTEXEC_API_KEY=${RESTEXEC_API_KEY}
      - RESTEXEC_URL=http://restexec:3000
    networks:
      - internal
      - external
    depends_on:
      - restexec

networks:
  internal:
    internal: true # 外部からアクセス不可
  external:
    driver: bridge
```

---

## 認証失敗時のレート制限

ブルートフォース攻撃を防ぐため、認証失敗時にレート制限を適用します。

### 動作仕様

| パラメータ     | デフォルト値 | 説明                           |
| -------------- | ------------ | ------------------------------ |
| ウィンドウ期間 | 60秒         | レート制限のカウント期間       |
| 最大試行回数   | 5回          | ウィンドウ期間内の最大失敗回数 |
| ブロック期間   | 60秒         | 制限発動後のブロック期間       |
| 識別子         | IP アドレス  | レート制限の対象識別           |

### レート制限の識別子戦略

| 環境              | 識別子                                         | 説明                                      |
| ----------------- | ---------------------------------------------- | ----------------------------------------- |
| Kubernetes (内部) | Pod IP または Service Account Token Subject    | NetworkPolicy と組み合わせて使用          |
| Kubernetes (外部) | `X-Forwarded-For` の最初のIP（信頼できる場合） | Ingress Controller が設定する場合のみ使用 |
| Docker Compose    | コンテナ IP                                    | 内部ネットワーク内の識別                  |
| 開発環境          | リクエスト元 IP                                | 単純な IP ベースの制限                    |

**セキュリティ上の注意**:

- `X-Forwarded-For` ヘッダーは信頼できる Ingress/Proxy が設定した場合のみ使用
- クライアントが直接 `X-Forwarded-For` を送信できる場合は使用しない
- 環境変数 `AUTH_RATE_LIMIT_TRUST_PROXY` で制御（デフォルト: false）

### レスポンス

#### 429 Too Many Requests - レート制限

```json
{
  "success": false,
  "error": {
    "type": "RateLimitError",
    "message": "Too many authentication failures",
    "details": {
      "retryAfter": 45,
      "limit": 5,
      "window": 60
    }
  },
  "executionTime": 1
}
```

**HTTP ヘッダー**:

```http
Retry-After: 45
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702051200
```

---

## セキュリティ上の考慮事項

### タイミング攻撃の防止

API Key の比較には、タイミングセーフな比較を使用します。

```typescript
// 悪い例: タイミング攻撃に脆弱
if (providedKey === expectedKey) { ... }

// 良い例: 定数時間比較
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### ログ記録

認証関連のイベントはログに記録されますが、API Key 自体は記録されません。

**記録される情報**:

- 認証成功/失敗
- リクエスト元 IP アドレス
- タイムスタンプ
- リクエストされたエンドポイント

**記録されない情報**:

- API Key の値
- API Key の一部

**ログ例**:

```
[INFO] Authentication successful: POST /execute from 10.0.0.5
[WARN] Authentication failed: GET /files/read from 10.0.0.10 (invalid API key)
[WARN] Rate limit exceeded: 10.0.0.10 (5 failures in 60s)
```

### API Key のローテーション

API Key は定期的にローテーションすることを推奨します。

**ローテーション手順**:

1. 新しい Secret を作成

```bash
kubectl create secret generic restexec-api-key-new \
  --namespace restexec \
  --from-literal=api-key="$(openssl rand -base64 48)"
```

2. Deployment を更新して新しい Secret を参照

3. すべての Pod が更新されたことを確認

4. 古い Secret を削除

```bash
kubectl delete secret restexec-api-key --namespace restexec
```

---

## 実装ガイドライン

### 認証ミドルウェアの実装

```typescript
// src/middleware/auth.ts
import { Context, Next } from '@oak/oak';
import { config } from '../config.ts';
import { logger } from '../utils/logger.ts';

// 認証不要なパス
const PUBLIC_PATHS = ['/health'];

export async function authMiddleware(ctx: Context, next: Next) {
  const path = ctx.request.url.pathname;

  // 認証が無効、または公開パスの場合はスキップ
  if (!config.auth.enabled || PUBLIC_PATHS.includes(path)) {
    await next();
    return;
  }

  const authHeader = ctx.request.headers.get('Authorization');
  const clientIP = ctx.request.ip;

  // レート制限チェック
  if (isRateLimited(clientIP)) {
    const retryAfter = getRetryAfter(clientIP);
    ctx.response.status = 429;
    ctx.response.headers.set('Retry-After', String(retryAfter));
    ctx.response.body = {
      success: false,
      error: {
        type: 'RateLimitError',
        message: 'Too many authentication failures',
        details: { retryAfter },
      },
    };
    return;
  }

  // Authorization ヘッダーの検証
  if (!authHeader) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (missing header)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Missing Authorization header',
      },
    };
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (invalid format)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Invalid Authorization header format',
      },
    };
    return;
  }

  const providedKey = authHeader.slice(7);

  if (!timingSafeEqual(providedKey, config.auth.apiKey)) {
    recordAuthFailure(clientIP);
    logger.warn(`Authentication failed: ${ctx.request.method} ${path} from ${clientIP} (invalid key)`);
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: {
        type: 'UnauthorizedError',
        message: 'Invalid API key',
      },
    };
    return;
  }

  // 認証成功
  logger.info(`Authentication successful: ${ctx.request.method} ${path} from ${clientIP}`);
  await next();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### 設定の追加

```typescript
// src/config.ts に追加
export const config = {
  // ... 既存の設定

  auth: {
    enabled: parseBooleanEnv(Deno.env.get('AUTH_ENABLED'), false),
    apiKey: Deno.env.get('AUTH_API_KEY') || '',
    rateLimit: {
      enabled: parseBooleanEnv(Deno.env.get('AUTH_RATE_LIMIT_ENABLED'), true),
      maxAttempts: parseInt(Deno.env.get('AUTH_RATE_LIMIT_MAX_ATTEMPTS') || '5', 10),
      windowMs: parseInt(Deno.env.get('AUTH_RATE_LIMIT_WINDOW_MS') || '60000', 10),
      trustProxy: parseBooleanEnv(Deno.env.get('AUTH_RATE_LIMIT_TRUST_PROXY'), false),
    },
  },
};

// AUTH_ENABLED が明示的に設定されていない場合の警告
if (Deno.env.get('AUTH_ENABLED') === undefined) {
  console.warn(
    '[WARN] AUTH_ENABLED is not explicitly set. Defaulting to false. This is NOT recommended for production.',
  );
}

// 起動時バリデーション
export function validateAuthConfig() {
  if (config.auth.enabled) {
    if (!config.auth.apiKey) {
      console.error('[ERROR] AUTH_ENABLED is true but AUTH_API_KEY is not set');
      Deno.exit(1);
    }
    if (config.auth.apiKey.length < 32) {
      console.error(`[ERROR] AUTH_API_KEY must be at least 32 characters long (current: ${config.auth.apiKey.length})`);
      Deno.exit(1);
    }
  }
}
```

**src/main.ts での呼び出し**:

```typescript
import { validateAuthConfig } from './config.ts';
validateAuthConfig();
```

---

## テストの考慮事項

### 単体テスト

1. 有効な API Key での認証成功
2. 無効な API Key での認証失敗
3. Authorization ヘッダーなしでの認証失敗
4. 不正なヘッダー形式での認証失敗
5. `/health` エンドポイントの認証スキップ
6. タイミングセーフ比較の動作確認

### 統合テスト

1. Kubernetes Secret からの API Key 読み込み
2. NetworkPolicy による通信制限
3. レート制限の動作確認
4. AI Agent からの認証付きリクエスト

### セキュリティテスト

1. ブルートフォース攻撃のシミュレーション
2. タイミング攻撃の検証
3. 不正な Pod からのアクセス試行
4. API Key なしでの各エンドポイントアクセス

---

## 今後の拡張

1. **mTLS 認証**: 相互 TLS 認証によるより強固なセキュリティ
2. **JWT 認証**: 外部 IdP との連携
3. **RBAC**: ロールベースのアクセス制御（読み取り専用、実行権限など）
4. **監査ログ**: 詳細な監査ログの記録と外部システムへの転送
5. **API Key スコープ**: エンドポイントごとに異なる API Key を使用

---

## 関連ドキュメント

- [Security.md](./Security.md) - 全体的なセキュリティ考慮事項
- [FileExplorerAPI.md](./FileExplorerAPI.md) - File Explorer API の認証要件
- [API.md](./API.md) - API エンドポイントの仕様
- [Configuration.md](./Configuration.md) - 環境変数の設定
