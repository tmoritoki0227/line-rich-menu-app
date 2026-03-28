# 【記事⑤】AWS × LINE 家計簿ボットをTypeScriptで作る — CI/CD（GitHub Actions による自動デプロイ）

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。全5記事。
>
> - 記事① AWS基盤 & 認証整備（IAM Identity Center）
> - 記事② ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）
> - 記事③ バックエンド実装（Node.js Lambda / DynamoDB）
> - 記事④ フロントエンドデプロイ + LINE連携 & 最終検証
> - **記事⑤** CI/CD（GitHub Actions による自動デプロイ）（本記事）

> **前提**: 記事①〜④の手順が完了していること（S3・CloudFront・Lambda・API Gateway の構築済み）。

---

## ステップ19：CI/CD のセットアップ（GitHub Actions）

コードを `main` ブランチに push したら自動でフロントエンドのビルド + S3 デプロイ、バックエンドのビルド + Lambda デプロイが走るようにする。

手作業でのデプロイ（`aws s3 sync`・ZIP 化・Lambda アップロード）をすべて自動化できる。

### 19-1. GitHub リポジトリの作成

**GitHub でリポジトリを作成する際の注意点（重要）:**

リポジトリ作成画面で以下の項目は**すべてチェックを外す（作成しない）**こと。

- `Add a README file` → **チェックしない**
- `Add .gitignore` → **None のまま**
- `Choose a license` → **None のまま**

これらをONにするとGitHub側にすでにコミットが作られ、ローカルと履歴が合わずpushが失敗する。**完全に空のリポジトリ**として作成する。

ローカルでコミットして push する。

```bash
# line-rich-menu-app フォルダで実行
git init
git branch -m master main
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_GITHUB_USER/line-rich-menu-app.git
git push -u origin main
```

### 19-2. AWS OIDC プロバイダーの設定

GitHub Actions から AWS にアクセスするための認証設定。アクセスキーを発行せず、OIDC による一時認証情報を使う。

> **なぜ OIDC か**: アクセスキー（永続的な認証情報）を GitHub に保存すると漏洩リスクがある。OIDC は「必要なときだけ使い捨ての一時認証情報を発行する」仕組みで、安全性が高い。

1. AWSコンソール ＞ **IAM** ＞ 左メニュー **[IDプロバイダー]** ＞ **[プロバイダーを追加]**。
2. 以下を入力して **[プロバイダーを追加]** をクリック。

| 項目 | 値 |
|---|---|
| プロバイダーのタイプ | OpenID Connect |
| プロバイダー URL | `https://token.actions.githubusercontent.com` |
| 対象者（Audience） | `sts.amazonaws.com` |

### 19-3. GitHub Actions 用 IAM ロールの作成

GitHub Actions が AWS に対して操作を行うためのロール。

1. **IAM** ＞ **[ロール]** ＞ **[ロールを作成]**。

2. **[ウェブアイデンティティ]** を選択する。

3. 以下を設定する。
   - **アイデンティティプロバイダー**: `token.actions.githubusercontent.com`
   - **Audience**: `sts.amazonaws.com`
   - **GitHub 組織**: 自分の GitHub ユーザー名
   - **GitHub リポジトリ**: `line-rich-menu-app`
   - **GitHub ブランチ**: （空欄のまま）

4. **[次へ]** ＞ 以下のポリシーをアタッチする。
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `AWSLambda_FullAccess`

5. ロール名: `github-actions-line-rich-menu-app` ＞ **[ロールを作成]**。

6. 作成したロールの **ARN**（例: `arn:aws:iam::123456789012:role/github-actions-line-rich-menu-app`）をコピーしておく。

### 19-4. GitHub Secrets の設定

GitHub リポジトリ ＞ **[Settings]** ＞ **[Secrets and variables]** ＞ **[Actions]** ＞ **[New repository secret]** で以下を追加する。

| シークレット名 | 値 |
|---|---|
| `AWS_ROLE_ARN` | ステップ19-3でコピーしたロールの ARN |
| `S3_BUCKET_NAME` | 記事④ステップ13で作成した S3 バケット名 |
| `CLOUDFRONT_DISTRIBUTION_ID` | 記事④ステップ14の CloudFront ディストリビューション ID |
| `LAMBDA_FUNCTION_NAME` | 記事③で作成した Lambda 関数名 |

> **ディストリビューション ID の確認方法**: AWSコンソール ＞ CloudFront ＞ ディストリビューション一覧の「ID」列（例: `ABCDEF1234GHIJ`）。

### 19-5. フロントエンドデプロイ用ワークフロー

`frontend/` フォルダに変更があって `main` にpushされると自動で以下を実行する。

1. リポジトリのコードを取得
2. Node.js 22 をセットアップ
3. OIDC で AWS に認証
4. `npm run build` で Vue アプリをビルド（`frontend/dist/` に出力）
5. `dist/` の中身を S3 に同期（削除も含む）
6. CloudFront のキャッシュを削除して最新版を配信

`.github/workflows/deploy-frontend.yml` を作成する。

```yaml
name: Deploy Frontend

# frontend/ フォルダに変更があったときだけ実行する
on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # OIDC トークンの発行に必要
      contents: read

    steps:
      # リポジトリのコードを取得
      - uses: actions/checkout@v4

      # Node.js のセットアップ
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      # AWS 認証（OIDC 経由で一時認証情報を取得）
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1

      # フロントエンドのビルド
      - name: Build
        working-directory: frontend
        run: npm ci && npm run build

      # S3 へのデプロイ
      - name: Deploy to S3
        run: |
          aws s3 sync frontend/dist/ s3://${{ secrets.S3_BUCKET_NAME }} --delete

      # CloudFront のキャッシュ削除
      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

### 19-6. バックエンドデプロイ用ワークフロー

`backend/` フォルダに変更があって `main` にpushされると自動で以下を実行する。

1. リポジトリのコードを取得
2. Node.js 22 をセットアップ
3. OIDC で AWS に認証
4. `npm run build` で TypeScript を JavaScript にビルド（`backend/dist/` に出力）
5. `dist/index.js` を ZIP 化
6. ZIP を Lambda にアップロードして関数コードを更新

`.github/workflows/deploy-backend.yml` を作成する。

```yaml
name: Deploy Backend

# backend/ フォルダに変更があったときだけ実行する
on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1

      # バックエンドのビルド
      - name: Build
        working-directory: backend
        run: npm ci && npm run build

      # ZIP 化（Linux 環境なので zip コマンドが使える）
      - name: Package
        run: cd backend/dist && zip ../function.zip index.js

      # Lambda へのデプロイ（関数コードの更新のみ）
      - name: Deploy to Lambda
        run: |
          aws lambda update-function-code \
            --function-name ${{ secrets.LAMBDA_FUNCTION_NAME }} \
            --zip-file fileb://backend/function.zip
```

> **`npm ci` と `npm install` の違い**: `npm ci` は `package-lock.json` の内容を厳密に再現してインストールする。CI/CD 環境では `npm ci` を使うのが推奨。

### 19-7. ワークフローファイルを push する

ここまでで作成したワークフローファイルをコミットして push する。**これをしないと GitHub Actions は一切動かない。**

```bash
git add .github/workflows/deploy-frontend.yml .github/workflows/deploy-backend.yml
git commit -m "add GitHub Actions workflows"
git push origin main
```

ただしワークフローのトリガー条件（`paths`）が `frontend/` や `backend/` の変更になっているため、ワークフローファイルの push だけでは自動実行されない。以下のコマンドで実際のファイルに変更を加えて push する。

```bash
# frontend と backend 両方をトリガーするため両方のファイルに触れる
git add frontend/src/App.vue backend/src/webhook.ts
git commit -m "trigger CI/CD"
git push origin main
```

### 19-8. 動作確認

1. GitHub リポジトリ ＞ **[Actions]** タブ ＞ 実行中のワークフローをクリック。
2. 全ステップが ✅ になるまで待つ（数分かかる）。
3. 完了したら CloudFront の URL でアプリを確認する。
4. 以降は `frontend/` または `backend/` のファイルを変更して push するだけで自動デプロイが走る。

---

### ✅ ステップ19 完了チェック

- [ ] GitHub リポジトリが作成されコードが push されている
- [ ] AWS OIDC プロバイダーが設定されている
- [ ] GitHub Actions 用 IAM ロールが作成されている
- [ ] GitHub Secrets が設定されている（4件）
- [ ] `.github/workflows/deploy-frontend.yml` が作成されている
- [ ] `.github/workflows/deploy-backend.yml` が作成されている
- [ ] `main` への push で GitHub Actions が自動実行される
- [ ] フロントエンドの変更が自動で CloudFront に反映される
- [ ] バックエンドの変更が自動で Lambda に反映される
