# Docker Compose セットアップガイド

このドキュメントでは、Docker Composeを使用してrestexecをローカル環境で実行する方法について説明します。

## 前提条件

- Docker（バージョン20.10以上）
- Docker Compose（バージョン2.0以上）

## ディレクトリ構成

```
restexec/
├── compose.yaml           # Docker Compose設定ファイル
├── example/               # サンプルコード
│   ├── workspace/            # 実行するTypeScriptコードを配置
│   │   ├── import_map.json  # Denoのimport map設定
│   │   ├── hello-world.ts   # サンプル: シンプルな実行例
│   │   ├── with-import.ts   # サンプル: toolsからのインポート例
│   │   └── async-example.ts # サンプル: 非同期処理の例
│   └── tools/                # 共有ユーティリティライブラリ
│       ├── types.ts         # 共通型定義
│       └── utils/
│           ├── math.ts      # 数学関数
│           └── string.ts    # 文字列操作関数
├── Dockerfile            # Dockerイメージのビルド定義
├── .env                  # 環境変数設定

```

## クイックスタート

### 1. 環境変数の設定

`.env`ファイルは既に作成されていますが、必要に応じて編集できます:

```bash
# .env
PORT=3000
WORKSPACE_DIR=/workspace
TOOLS_DIR=/tools
DEFAULT_TIMEOUT=5000
MAX_TIMEOUT=300000
LOG_LEVEL=info
```

### 2. Docker Composeでサービスを起動

```bash
# イメージのビルドとコンテナの起動
docker compose up -d

# ログを確認
docker compose logs -f restexec
```

### 3. サービスの動作確認

```bash
# ヘルスチェック
curl http://localhost:3000/health

# サンプルコードの実行（hello-world.ts）
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"filename": "hello-world.ts"}'

# import付きのサンプル実行（with-import.ts）
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"filename": "with-import.ts"}'

# 非同期処理のサンプル実行（async-example.ts）
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"filename": "async-example.ts"}'
```

## 開発モード

開発中にソースコードの変更を反映させたい場合は、`compose.yaml`の以下のコメントを解除してください:

```yaml
volumes:
  - ./workspace:/workspace
  - ./tools:/tools
  # 開発モード用: ソースコードをマウント
  - ./src:/app/src:ro
  - ./deno.json:/app/deno.json:ro
```

この設定により、ソースコードを変更した際にコンテナを再ビルドする必要がなくなります。

## よく使うコマンド

### サービスの管理

```bash
# サービスの起動
docker compose up -d

# サービスの停止
docker compose down

# サービスの再起動
docker compose restart

# イメージの再ビルド
docker compose build

# ログの確認
docker compose logs -f

# コンテナのステータス確認
docker compose ps
```

### ボリュームの管理

```bash
# ボリュームの一覧表示
docker volume ls

# ボリュームの削除（注意: データが失われます）
docker compose down -v
```

### デバッグ

```bash
# コンテナ内でシェルを実行
docker compose exec restexec sh

# コンテナ内のファイルを確認
docker compose exec restexec ls -la /workspace
docker compose exec restexec ls -la /tools

# Denoのバージョン確認
docker compose exec restexec deno --version
```

## カスタムコードの追加

### workspace/ディレクトリにコードを追加

`workspace/`ディレクトリに新しいTypeScriptファイルを作成します:

```typescript
// workspace/my-script.ts
import { add, sum } from 'utils/math.ts';
import { capitalize } from 'utils/string.ts';

export default function main() {
  const numbers = [1, 2, 3, 4, 5];

  return {
    sum: sum(numbers),
    greeting: capitalize('hello from restexec!'),
    timestamp: new Date().toISOString(),
  };
}
```

### tools/ディレクトリにユーティリティを追加

共有ライブラリを`tools/`ディレクトリに追加できます:

```typescript
// tools/utils/date.ts
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

### import_map.jsonの更新

新しいモジュールを追加した場合は、`workspace/import_map.json`を更新します:

```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "types": "/tools/types.ts",
    "date/": "/tools/utils/date.ts"
  }
}
```

## トラブルシューティング

### ポート3000が既に使用されている

`.env`ファイルで別のポートを指定します:

```bash
PORT=3001
```

その後、サービスを再起動します:

```bash
docker compose down
docker compose up -d
```

### パーミッションエラー

workspace/やtools/ディレクトリのパーミッションを確認します:

```bash
chmod -R 755 workspace/ tools/
```

### コンテナが起動しない

ログを確認してエラーメッセージを確認します:

```bash
docker compose logs restexec
```

### イメージのクリーンビルド

キャッシュをクリアして再ビルドします:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## セキュリティに関する注意事項

- 本番環境では、適切なファイアウォール設定を行ってください
- `.env`ファイルには機密情報を含めないでください
- `DENO_ALLOW_*`環境変数で実行権限を適切に制限してください
- workspace/内のコードは信頼できるソースからのみ実行してください

## 参考資料

- [Docker公式ドキュメント](https://docs.docker.com/)
- [Docker Compose公式ドキュメント](https://docs.docker.com/compose/)
- [Deno公式ドキュメント](https://deno.land/manual)
