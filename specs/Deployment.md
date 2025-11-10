# デプロイメント仕様

## Dockerイメージ

- **ベースイメージ**: `denoland/deno:alpine-2.5.6`
- **サイズ目標**: < 150MB
- **セキュリティ**: 非rootユーザーで実行

## コンテナリソース

```yaml
resources:
  limits:
    cpu: "2"
    memory: "2Gi"
  requests:
    cpu: "500m"
    memory: "512Mi"
```

## ボリュームマウント

```yaml
volumes:
  - name: workspace
    mountPath: /workspace
    readOnly: false
  - name: tools
    mountPath: /tools
    readOnly: true
```

### Import Map の配置

Deno の子プロセスは `/workspace/import_map.json` を使用してモジュール解決を行います。

**デフォルト構成:**
- Docker イメージには基本的な import_map.json が `/workspace/` に含まれています
- この import_map.json はビルド時にコピーされます

**カスタム構成:**
- カスタムの import_map.json を使用する場合は、`/workspace` をマウントする際にホスト側の import_map.json を含めてください
- 例: `./example/workspace:/workspace` のようにマウントすると、ホスト側の import_map.json が使用されます

**注意事項:**
- ホストマウントなしでデプロイする場合、イメージに含まれるデフォルトの import_map.json が使用されます
- カスタムの import_map.json が必要な場合は、独自の Dockerfile を作成して適切なファイルをコピーしてください
- `DENO_IMPORT_MAP` 環境変数でパスを変更できますが、対応するファイルが存在することを確認してください
