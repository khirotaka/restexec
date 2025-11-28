# Renovate セットアップガイド

このドキュメントでは、restexecプロジェクトでRenovateを使った依存関係の自動更新を設定する方法を説明します。

## 📋 概要

Renovateは、プロジェクトの依存関係を自動的に検出し、更新のPull Requestを作成するツールです。
このプロジェクトでは、以下の依存関係を管理します：

- **Dockerイメージ** (`Dockerfile`) - Deno runtime
- **Deno標準ライブラリ** (`deno.json`) - @std/*, @oak/oak
- **外部npmライブラリ** (`import_map.json`, `deps.ts`) - esm.sh経由
- **Exampleのimport map** (`example/workspace/import_map.json`)

---

## 🚀 セットアップ手順

### 1. GitHub AppとしてRenovateをインストール

1. [Renovate GitHub App](https://github.com/apps/renovate) にアクセス
2. 「Install」または「Configure」をクリック
3. リポジトリを選択（khirotaka/restexec）
4. 権限を承認

### 2. 設定ファイルの確認

プロジェクトルートに`renovate.json`が既に配置されています：

```bash
restexec/
├── renovate.json          # Renovate設定ファイル
├── Dockerfile             # Deno runtime (監視対象)
├── deno.json              # Deno dependencies (監視対象)
├── import_map.json        # npm libraries (監視対象)
├── deps.ts                # npm libraries (監視対象)
└── example/
    └── workspace/
        └── import_map.json # npm libraries (監視対象)
```

### 3. 自動実行の開始

Renovate Appをインストールすると、自動的に：

1. **Dependency Dashboard**（Issue）が作成される
2. 毎週月曜の午前10時（日本時間）にチェックが実行される
3. 更新が必要な依存関係があればPRが作成される

---

## 📦 管理される依存関係

### Deno Runtime (Dockerfile)

```dockerfile
FROM denoland/deno:alpine-2.5.6
```

**更新タイミング**: Denoの新バージョンリリース時
**グループ**: `Deno runtime`
**コミット**: `chore(docker): update Deno runtime to vX.X.X`

### Deno標準ライブラリ (deno.json)

```json
{
  "imports": {
    "@std/path": "https://deno.land/std@0.224.0/path/mod.ts",
    "@std/assert": "https://deno.land/std@0.224.0/assert/mod.ts"
  }
}
```

**更新タイミング**: @std/*パッケージの新バージョンリリース時
**グループ**: `Deno standard library`（まとめてPR作成）
**コミット**: `chore(deps): update Deno standard library`

### Oak Framework (deno.json)

```json
{
  "imports": {
    "@oak/oak": "https://deno.land/x/oak@v17.1.6/mod.ts"
  }
}
```

**更新タイミング**: Oakの新バージョンリリース時
**グループ**: `Oak framework`
**コミット**: `chore(deps): update Oak framework to vX.X.X`

### 外部npmライブラリ (import_map.json, deps.ts)

```json
{
  "imports": {
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "date-fns": "https://esm.sh/date-fns@3.0.0",
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

**更新タイミング**: 各npmパッケージの新バージョンリリース時
**グループ**: `utility libraries`（まとめてPR作成）
**コミット**: `chore(deps): update utility libraries`

**重要**: `import_map.json`、`example/workspace/import_map.json`、`deps.ts`の
3ファイルは同時に更新されます。

---

## ⚙️ 設定の詳細

### スケジュール

```json
"schedule": ["before 10am on monday"]
```

毎週月曜日の午前10時（日本時間）に依存関係のチェックを実行します。

### PR制限

```json
"prConcurrentLimit": 5,
"prHourlyLimit": 2
```

- **同時PR数**: 最大5個
- **時間あたりのPR数**: 最大2個

スパムを防ぎ、レビュー負荷を軽減します。

### グループ化戦略

関連する依存関係を1つのPRにまとめます：

- **Deno標準ライブラリ** - @std/*をまとめる
- **Utilityライブラリ** - es-toolkit, date-fns, zodなどをまとめる
- **Oak framework** - 単独でPR
- **Deno runtime** - 単独でPR

### セキュリティアラート

```json
"vulnerabilityAlerts": {
  "enabled": true,
  "labels": ["security"]
},
"osvVulnerabilityAlerts": true
```

脆弱性が発見された依存関係は即座にPRが作成され、`security`ラベルが付与されます。

---

## 📊 Dependency Dashboard

Renovateは自動的に「Dependency Dashboard」Issueを作成します。
このIssueでは以下を確認できます：

- ✅ 保留中の更新
- 🔄 進行中のPR
- ⏸️ スキップされた更新
- ❌ 失敗した更新

**ダッシュボードの使い方**:

- 更新をスキップ: チェックボックスをクリック
- PRを即座に作成: 「Create PR」をクリック
- 特定の更新を無効化: IssueにコメントでRenovateに指示

---

## 🔍 PR確認のワークフロー

Renovateが作成したPRは、以下の手順で確認します：

### 1. PRの内容を確認

- **変更ファイル**: 何が更新されたか
- **リリースノート**: 各パッケージの変更内容
- **CI/CD結果**: テストが通っているか

### 2. ローカルでテスト（オプション）

```bash
# PRブランチをチェックアウト
gh pr checkout <PR番号>

# テストを実行
deno task test

# Dockerビルドを確認（deps.tsやimport_map.json更新時）
docker compose build
docker compose up -d
curl http://localhost:3000/health
```

### 3. マージ

問題がなければマージします。Renovateは自動的に：

- ブランチを削除
- Dependency Dashboardを更新

---

## 🛠️ カスタマイズ

### 更新スケジュールの変更

```json
"schedule": ["after 9pm on sunday"]  // 日曜夜に変更
```

### PR数の調整

```json
"prConcurrentLimit": 10,  // 同時PR数を増やす
"prHourlyLimit": 5        // 時間あたりのPR数を増やす
```

### 自動マージの有効化（非推奨）

```json
"packageRules": [
  {
    "matchUpdateTypes": ["patch"],  // パッチ更新のみ
    "automerge": true
  }
]
```

**注意**: セキュリティリスクがあるため、本番環境では慎重に使用してください。

### 特定パッケージの除外

```json
"packageRules": [
  {
    "matchPackageNames": ["zod"],
    "enabled": false
  }
]
```

---

## ❗ トラブルシューティング

### Issue: Dependency Dashboardが作成されない

**原因**: Renovate Appの権限不足

**解決策**:
1. GitHub → Settings → Integrations → Renovate
2. 権限を再確認・再承認

### Issue: PRが作成されない

**原因**:
- 設定ファイルのJSON構文エラー
- 依存関係の検出失敗

**解決策**:
1. renovate.jsonの構文チェック: https://docs.renovatebot.com/config-validation/
2. Dependency Dashboardで「Detected dependencies」セクションを確認

### Issue: deps.tsとimport_map.jsonのバージョン不一致

**原因**: Renovateが一部のファイルのみを更新

**解決策**:
設定の`fileMatch`を確認：

```json
"deno": {
  "fileMatch": [
    "^deno\\.jsonc?$",
    "^import_map\\.json$",
    "^example/workspace/import_map\\.json$",
    "^deps\\.ts$"
  ]
}
```

すべてのファイルが含まれていることを確認。

### Issue: Dockerビルドが失敗

**原因**: deps.ts更新後にDockerキャッシュが古い

**解決策**:

```bash
# キャッシュを削除してビルド
docker compose build --no-cache

# 再起動
docker compose up -d
```

---

## 📚 参考リンク

- [Renovate公式ドキュメント](https://docs.renovatebot.com/)
- [Deno用Renovate設定](https://docs.renovatebot.com/modules/manager/deno/)
- [Docker用Renovate設定](https://docs.renovatebot.com/modules/manager/dockerfile/)
- [Renovate GitHub App](https://github.com/apps/renovate)

---

## 🔒 セキュリティ考慮事項

### 脆弱性スキャン

Renovateは自動的に：

- **OSV Database**をチェック
- **GitHub Advisory Database**をチェック
- 脆弱性があれば`security`ラベル付きPRを即座に作成

### レビューポリシー

以下の更新は必ずレビューが必要です：

- ✅ Major version updates（破壊的変更の可能性）
- ✅ Security alerts（脆弱性修正）
- ✅ Deno runtime updates（実行環境の変更）

Patch/Minor updatesは、テストが通れば自動マージも検討可能です。

---

## 🎯 まとめ

Renovateをセットアップすることで：

1. ✅ 依存関係が常に最新に保たれる
2. ✅ セキュリティ脆弱性を早期発見
3. ✅ 手動更新の手間を削減
4. ✅ 変更履歴が明確になる

**初回セットアップ後、特に追加作業は不要です。**
Dependency Dashboardで定期的に状態を確認し、PRをレビューするだけです。

---

*最終更新: 2025-11-13*
