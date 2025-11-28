# restexec

`restexec` は、REST API経由でTypeScriptコードを安全に実行するサービスです。共有ディレクトリに配置されたTypeScriptファイルをDeno runtimeで動的に実行し、その結果をJSON形式で返却します。Denoの厳格なパーミッションシステムにより、ファイルシステム、ネットワーク、プロセス実行を細かく制御できます。

## システムアーキテクチャ

```mermaid
graph TB
    subgraph "restexec Container"
        subgraph "Main Process (PID 1)"
            HTTPServer["HTTP Server<br/>Oak Framework<br/>Port: 3000"]
            Router["Request Router"]
            Validator["Request Validator"]
        end

        subgraph "Core Components"
            Executor["Code Executor"]
            ProcessMgr["Process Manager"]
            ResultParser["Result Parser"]
        end

        subgraph "Child Processes"
            Deno1["Deno Process 1<br/>/workspace/exec-123.ts"]
            Deno2["Deno Process 2<br/>/workspace/exec-124.ts"]
        end

        subgraph "File System"
            Workspace["/workspace<br/>(Code Files)"]
            Tools["/tools<br/>(Dependencies)"]
        end
    end

    Client["REST API Client"] -->|POST /execute| HTTPServer
    HTTPServer --> Router
    Router --> Validator
    Validator --> Executor

    Executor -->|spawn deno| ProcessMgr
    ProcessMgr -->|Create| Deno1
    ProcessMgr -->|Create| Deno2

    Deno1 -->|Read| Workspace
    Deno1 -->|Import| Tools
    Deno2 -->|Read| Workspace
    Deno2 -->|Import| Tools

    Deno1 -->|stdout/stderr| ProcessMgr
    Deno2 -->|stdout/stderr| ProcessMgr
    ProcessMgr --> ResultParser
    ResultParser --> HTTPServer
    HTTPServer -->|JSON Response| Client

    style HTTPServer fill:#2196F3,color:#fff
    style Executor fill:#FF9800,color:#fff
    style Deno1 fill:#4CAF50,color:#fff
    style Deno2 fill:#4CAF50,color:#fff
    style Workspace fill:#f0f0f0
    style Tools fill:#f0f0f0
```

## ディレクトリ構造

```
services/restexec/              # サービスルート
├── src/                        # ソースコード
│   ├── app.ts                  # Oak アプリケーション設定
│   ├── index.ts                # エントリーポイント
│   ├── config.ts               # 設定管理
│   ├── executor.ts             # コード実行エンジン
│   ├── middleware/
│   │   └── validation.ts       # リクエストバリデーション
│   ├── routes/
│   │   ├── execute.ts          # 実行エンドポイント
│   │   └── health.ts           # ヘルスチェックエンドポイント
│   ├── types/
│   │   └── index.ts            # 型定義
│   └── utils/
│       ├── logger.ts           # ロガー
│       └── errors.ts           # カスタムエラークラス
├── tests/                      # テストスイート
│   ├── unit/
│   │   └── executor.test.ts    # Executor ユニットテスト
│   └── fixtures/
│       ├── success.ts          # テスト用の成功コード
│       ├── error.ts            # テスト用のエラーコード
│       └── timeout.ts          # テスト用のタイムアウトコード
├── example/                    # サンプルコードとユーティリティ
│   ├── workspace/              # 実行可能スクリプト
│   │   ├── hello-world.ts
│   │   ├── with-import.ts
│   │   └── async-example.ts
│   └── tools/                  # 共有ユーティリティライブラリ
│       ├── math.ts
│       └── string.ts
├── specs/                      # 仕様書
│   ├── API.md
│   ├── SystemArchitecture.md
│   ├── Security.md
│   ├── Libraries.md            # ライブラリ追加ガイド
│   └── ...
├── deps.ts                     # 外部ライブラリ依存関係
├── Dockerfile                  # Docker イメージ定義
├── deno.json                   # Deno 設定
├── DOCKER.md                   # Docker ドキュメント
└── README.md                   # このファイル
```

## 外部ライブラリの使用

restexecは`--cached-only`フラグを使用してセキュリティを強化しています。これにより、実行時に外部モジュールをダウンロードすることはできません。

外部ライブラリを使用する場合は、**ビルド時に事前にキャッシュする**必要があります。詳細な手順については、[ライブラリの追加方法](specs/Libraries.md)を参照してください。

### クイックスタート

1. `deps.ts`にライブラリを追加
2. `import_map.json`を更新（オプション）
3. コンテナを再ビルド: `docker compose build`
4. コンテナを起動: `docker compose up -d`

詳細は [specs/Libraries.md](specs/Libraries.md) を参照してください。
