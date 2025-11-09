# デプロイメント仕様

## Dockerイメージ

- **ベースイメージ**: `node:20-alpine`
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
