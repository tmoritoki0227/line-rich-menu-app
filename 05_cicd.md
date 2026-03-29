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

## 主要ファイル一覧

自分で書いたファイルのみ。ビルド成果物・自動生成ファイルは除く。

### フロントエンド（`frontend/src/`）

**`App.vue`**
スマホで表示される画面そのもの。日付・金額・品物を入力して「保存する」ボタンを押すと、LINEのトークに通知を送りつつバックエンドAPIにデータを保存する。「集計する」ボタンを押すと指定した期間の合計金額を取得して画面に表示する。このファイルを変えると画面のレイアウトや動作が変わる。

**`constants.ts`**
`LIFF_ID`（LINEアプリのID）と`API_BASE_URL`（バックエンドAPIのURL）の2つだけを管理するファイル。API GatewayのURLが変わったときはここだけ直せばよい。直接`App.vue`に書くと変更時に探し回る必要があるため外出しにしている。

**`types.ts`**
TypeScriptの型定義だけを書いたファイル。`LiffContext`という型（`userId`・`groupId`・`roomId`を持つオブジェクト）を定義している。型定義はコードの書き間違いをエディタやビルド時に検出するためのもので、実際の処理は何もない。ビルド後の`dist/index.js`には出力されないが、ソースファイルとしては残り続ける。

### バックエンド（`backend/src/`）

**`index.ts`**
Lambdaが最初に呼び出すファイル。リクエストのHTTPメソッド（GET/POST）とパス（`/transaction`、`/history`など）を見て「これは`transaction.ts`の処理だ」「これは`webhook.ts`の処理だ」と振り分けるだけで、自分では何も処理しない。新しいAPIエンドポイントを追加するときはここにも追記が必要。

**`transaction.ts`**
DynamoDB（データベース）との読み書きを担当するファイル。3つの処理が入っている。
- 保存（POST /transaction）: LIFFフォームから送られた日付・金額・品物をDynamoDBに書き込む
- 履歴取得（GET /history）: そのユーザーの全記録を返す
- 期間集計（GET /summary）: 指定した開始日〜終了日の合計金額を計算して返す

**`webhook.ts`**
LINEのトークでメッセージを送ったときに呼ばれるファイル。「合計」と送ると当月の合計金額を返す、「最新の履歴を表示」と送ると最新5件を返す、それ以外のメッセージには使い方の案内を返す。LIFFフォームから送られる通知メッセージ（「💰 家計簿記録完了！」で始まるもの）は無視するようにしている。

### ワークフロー（`.github/workflows/`）

| ファイル | 役割 |
|---|---|
| `deploy-frontend.yml` | `frontend/` に変更があって main に push されたら自動でビルド → S3 同期 → CloudFront キャッシュ削除 |
| `deploy-backend.yml` | `backend/` に変更があって main に push されたら自動でビルド → ZIP 化 → Lambda 更新 |

### 設定ファイル（ルート直下）

| ファイル | 役割 |
|---|---|
| `.gitignore` | Git の管理対象から除外するファイルを指定。`node_modules/` や `dist/` を除外している |

---

## 応用編：やってみよう

この勉強会の内容を一通り終えたら、以下に挑戦してみると理解がさらに深まる。

### インフラのコード化（IaC）

今回はAWSコンソールで手動構築したが、SAM（AWS Serverless Application Model）やCDK（AWS Cloud Development Kit）を使うと構成をコードで管理できる。

- **AWS SAM**: LambdaやAPI GatewayをYAMLで定義してデプロイできる。`sam deploy`一発でAWS環境が再現できる
- **AWS CDK**: TypeScriptでインフラを記述できる。今回のコードと同じ言語で書けるため親和性が高い

### テストの導入

今回はテストを書いていない。以下を追加すると品質が上がる。

- **Vitest**: Vue 3 + TypeScriptのユニットテスト。フロントエンドのロジックを自動検証できる
- **Jest**: バックエンドのLambda関数のテスト。`transaction.ts`や`webhook.ts`の動作を検証できる
- **GitHub ActionsにテストをCI追加**: pushのたびに自動でテストが走るようにする


---

## この構成について率直なまとめ

### 開発効率はPythonより上がったか？

**正直に言うと、上がっていない。** むしろ手間は増えた。

Pythonで書いていたときはLambdaのコードエディタに直接貼り付けて保存するだけで動いた。今回はコードを変えるたびに以下の作業が発生する。

- バックエンド: ビルド → ZIP → Lambdaにアップロード
- フロントエンド: ビルド → S3に同期 → CloudFrontキャッシュ削除

これは「モダンな構成」ではあっても「楽な構成」ではない。CI/CDを設定して初めて `git push` だけで自動デプロイが走るようになり、そこで初めて楽になる。**記事⑤がその本番。**

### Vue 3 + Viteは使えているか？

半分だけ。

| 機能 | 状況 |
|---|---|
| `npm run build`（本番ビルド） | ✅ 使えている |
| `npm run dev`（ローカルプレビュー・ホットリロード） | ❌ ほぼ使えていない |

LIFFはLINEアプリ経由でないと動かないため、`npm run dev` でブラウザを開いてリアルタイムに確認するという開発フローが使いにくい。動作確認のたびにビルド → S3アップロード → スマホで確認という流れになってしまっている。

### 流行りの技術を取り入れているか？

取り入れている。ただし用途との相性は様々。

| 技術 | 評価 |
|---|---|
| TypeScript | ✅ 型安全。今の主流 |
| Vue 3 + Vite | ✅ モダンなフロントエンド構成 |
| GitHub Actions CI/CD | ✅ 今の標準。記事⑤で体験できる |
| AWS Lambda | ✅ サーバーレス。流行り |
| CloudFront + OAC | ⚠️ 個人用途には過剰。S3の静的ウェブサイトホスティングで十分だった |
| API Gateway REST API | ⚠️ 最近はHTTP APIの方が軽量で安い |

### この構成を選んだ理由

「TypeScript + Vue + AWS + CI/CD」という構成をQiitaの記事として残すことが目的。実務でチーム開発をする場合にこれらの技術が使われることは多いが、「この構成が標準」とは言い切れない。会社やプロジェクトによって構成は様々で、Pythonを使うチームも多い。

個人で小さいものを作るだけなら、**PythonでLambdaに直接書く方が圧倒的に速い。**


## 勉強会募集メッセージ案

**テーマ: LINEとAWSを連携したアプリ開発**

LINEのトーク画面を起点に、AWS上で動くアプリをゼロから作ります。TypeScript + Vue・GitHubも使います。
興味のある方はぜひご参加ください。