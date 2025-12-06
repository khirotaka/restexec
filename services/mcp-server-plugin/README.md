# MCP Server Plugin

Kubernetes の Init Container として動作し、MCP Server バイナリと `client.ts` を共有ボリュームにデプロイします。

## 概要

このサブプロジェクトは、以下の責務を担当します：

1. **MCP Server バイナリのビルドと配置** - Go ソースコードから MCP Server をビルドし、指定されたボリュームにコピー
2. **client.ts の配置** - `mcp-tool-generator` が使用する MCP Client コードを提供

## ディレクトリ構造

```
services/mcp-server-plugin/
├── Dockerfile          # Init Container イメージ
├── deploy.sh           # エントリポイントスクリプト
├── README.md
├── client/
│   └── client.ts       # MCP Gateway クライアントコード
└── servers/
    └── sample-mcp-server/  # MCP Server の Go ソースコード
```

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| `MCP_BINARIES_DIR` | `/mnt/mcp-binaries` | MCP Server バイナリのコピー先 |
| `CLIENT_CODE_DIR` | `/mnt/client` | client.ts のコピー先 |

## ビルド

```bash
docker build -t mcp-server-plugin:latest .
```

## Kubernetes での使用

```yaml
initContainers:
  - name: mcp-server-plugin
    image: mcp-server-plugin:latest
    env:
      - name: MCP_BINARIES_DIR
        value: /mnt/mcp-binaries
      - name: CLIENT_CODE_DIR
        value: /mnt/client
    volumeMounts:
      - name: mcp-binaries-volume
        mountPath: /mnt/mcp-binaries
      - name: client-code-volume
        mountPath: /mnt/client
```

## MCP Server の追加

新しい MCP Server を追加するには：

1. `servers/` 配下に新しいディレクトリを作成
2. Go の MCP Server 実装を追加
3. `Dockerfile` を更新してビルドステップを追加

```dockerfile
# In builder stage
COPY servers/my-new-server/ ./my-new-server/
RUN cd my-new-server && go build -o /my-new-server .

# In final stage
COPY --from=builder /my-new-server /mcp-binaries/my-new-server
```
