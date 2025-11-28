# restexec - モノレポ

このリポジトリは、複数のサービスを管理するモノレポ構造です。

## サービス

### restexec

REST API経由でTypeScriptコードを安全に実行するサービスです。Denoの厳格なパーミッションシステムにより、ファイルシステム、ネットワーク、プロセス実行を細かく制御できます。

- **ディレクトリ**: [services/restexec/](services/restexec/)
- **README**: [services/restexec/README.md](services/restexec/README.md)
- **Dockerガイド**: [services/restexec/DOCKER.md](services/restexec/DOCKER.md)

## クイックスタート

```bash
# Docker Composeでrestexecサービスを起動
docker compose up -d

# ログを確認
docker compose logs -f restexec

# ヘルスチェック
curl http://localhost:3000/health

# 停止
docker compose down
```

## ローカル開発

各サービスのディレクトリで開発を行います。

```bash
# restexecサービスのディレクトリに移動
cd services/restexec

# 依存関係をキャッシュ
deno task cache

# テストを実行
deno task test

# ローカルで起動
deno task dev
```

## プロジェクト構造

```
restexec/
├── services/
│   └── restexec/          # REST API実行サービス
├── .github/               # CI/CD設定
├── .claude/               # Claude Code設定
└── compose.yaml           # Docker Compose設定
```

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。
