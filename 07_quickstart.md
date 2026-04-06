# 【記事⑦】AWS × LINE 家計簿ボット — git clone からアプリを最短で構築する

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。
>
> - 記事① AWS基盤 & 認証整備（IAM Identity Center）
> - 記事② ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）
> - 記事③ バックエンド実装（Node.js Lambda / DynamoDB）
> - 記事④ フロントエンドデプロイ + LINE連携 & 最終検証
> - 記事⑤ CI/CD（GitHub Actions による自動デプロイ）
> - 記事⑥ SAM で AWS インフラを一括構築する（応用編）
> - **記事⑦** git clone からアプリを最短で構築する（本記事）

> **この記事の位置づけ**: コードはすべて [GitHub リポジトリ](https://github.com/tmoritoki0227/line-rich-menu-app) にある。`git clone` でコード一式を取得し、**設定作業だけでアプリを動かす**最短手順をまとめる。AWS リソースは何もない状態からスタートする。

---

## この記事でやること

| # | 作業 | 所要時間の目安 |
|---|---|---|
| 1 | リポジトリのクローンと依存インストール | 5分 |
| 2 | LINE チャンネル・LIFF の初期設定 | 15分 |
| 3 | GitHub Actions 用 IAM ロールの作成 | 10分 |
| 4 | スタック名カスタマイズ・`.env` の作成・SAM ビルド・SAM デプロイ | 20分 |
| 5 | `constants.ts` の更新 | 5分 |
| 6 | LINE の後続設定（Webhook・LIFF エンドポイント・リッチメニュー） | 15分 |
| 7 | GitHub Secrets の設定と CI/CD の確認 | 10分 |

---

## 前提条件

以下がすべて完了していること。

| 条件 | 参照 |
|---|---|
| AWS アカウントがあり IAM Identity Center が設定済み | **記事①** |
| `aws sso login --profile line-rich-menu-app` でログインできる | **記事①** |
| Node.js 22.x がインストールされている | — |
| SAM CLI がインストールされている | [公式インストール手順](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| GitHub アカウントがあり、このリポジトリを fork または push 権限がある | — |

---

## ステップ1：リポジトリのクローンと依存インストール

```bash
git clone https://github.com/tmoritoki0227/line-rich-menu-app.git
cd line-rich-menu-app
```

フロントエンドとバックエンドの依存パッケージをインストールする。

```bash
# フロントエンド
cd frontend
npm install
cd ..

# バックエンド
cd backend
npm install
cd ..
```

クローン直後のファイル構成：

```
line-rich-menu-app/
├── frontend/          ← Vue 3 フロントエンド（LIFF アプリ）
├── backend/           ← Lambda 関数（TypeScript）
├── template.yaml      ← SAM テンプレート（AWS インフラ定義）
├── samconfig.toml     ← SAM デプロイ設定
└── .github/workflows/
    └── deploy.yml     ← GitHub Actions ワークフロー
```

> コードはすべて揃っている。以降の作業は**設定値の入力とコマンド実行のみ**。

---

## ステップ2：LINE の初期設定

LINE Developers でチャンネルと LIFF アプリを作成し、後のステップで必要な値を手元にメモする。詳細な手順は **記事②「ステップ4〜5」** を参照。

| やること | 手順の参照先 | メモする値 |
|---|---|---|
| LINE Developers でプロバイダー作成 | **記事②「ステップ4-1」** | — |
| Messaging API チャンネル作成 | **記事②「ステップ4-2」** | — |
| チャンネルアクセストークン発行 | **記事②「ステップ4-3」** | `LINE_CHANNEL_ACCESS_TOKEN` |
| チャンネルシークレット確認 | **記事②「ステップ4-3」** | `LINE_CHANNEL_SECRET` |
| LIFF アプリ作成・LIFF ID 取得 | **記事②「ステップ5」** | `LIFF_ID` |

> **LIFF アプリ作成時のエンドポイント URL**: この時点では CloudFront の URL がまだわからない。仮の URL（例: `https://example.com`）を入力しておき、ステップ5で正しい URL に更新する。

---

## ステップ3：GitHub Actions 用 IAM ロールの作成

GitHub Actions が AWS にデプロイするための IAM ロールを手動で作成する。詳細な手順と理由は **記事⑥「ステップ1」** を参照。

以下の2つのJSONファイルをプロジェクトルートに作成する（VSCode 等で作成）。**`YOUR_ACCOUNT_ID`** を自分の AWS アカウント ID、**`YOUR_GITHUB_ORG`** を自分の GitHub ユーザー名に書き換える。

> AWS アカウント ID は AWS コンソール右上のアカウント名をクリックすると確認できる（12桁の数字）。

**trust-policy.json**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/line-rich-menu-app:*"
        }
      }
    }
  ]
}
```

**deploy-policy.json**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*", "lambda:*", "apigateway:*",
        "dynamodb:*", "s3:*", "cloudfront:*",
        "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy",
        "iam:TagRole", "iam:ListRoleTags"
      ],
      "Resource": "*"
    }
  ]
}
```

2つのファイルを作成したら以下のコマンドを実行する。

**Mac / Linux:**

```bash
aws iam create-role \
  --role-name github-actions-line-rich-menu-app-v4 \
  --assume-role-policy-document file://trust-policy.json \
  --profile line-rich-menu-app

aws iam put-role-policy \
  --role-name github-actions-line-rich-menu-app-v4 \
  --policy-name DeployPolicy \
  --policy-document file://deploy-policy.json \
  --profile line-rich-menu-app

# ARN を確認してメモしておく
aws iam get-role \
  --role-name github-actions-line-rich-menu-app-v4 \
  --query "Role.Arn" --output text \
  --profile line-rich-menu-app

# 一時ファイルを削除
rm trust-policy.json deploy-policy.json
```

**Windows（PowerShell）:**

```powershell
aws iam create-role `
  --role-name github-actions-line-rich-menu-app-v4 `
  --assume-role-policy-document file://trust-policy.json `
  --profile line-rich-menu-app

aws iam put-role-policy `
  --role-name github-actions-line-rich-menu-app-v4 `
  --policy-name DeployPolicy `
  --policy-document file://deploy-policy.json `
  --profile line-rich-menu-app

# ARN を確認してメモしておく
aws iam get-role `
  --role-name github-actions-line-rich-menu-app-v4 `
  --query "Role.Arn" --output text `
  --profile line-rich-menu-app

# 一時ファイルを削除
Remove-Item trust-policy.json, deploy-policy.json
```

出力された ARN（`arn:aws:iam::XXXXXXXXXXXX:role/github-actions-line-rich-menu-app-v4`）をメモしておく。ステップ7の GitHub Secrets 設定で使う。

---

## ステップ4：.env の作成と SAM デプロイ

### 4-1. .env の作成

プロジェクトルートに `.env` を作成し、ステップ2でメモしたトークンを設定する。`.env` はすでに `.gitignore` に登録済みなので Git に混入しない。

```bash
# .env（Git には含めない）
LINE_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークンを貼り付ける
LINE_CHANNEL_SECRET=ここにチャネルシークレットを貼り付ける
```

> **`.env` と GitHub Secrets の使い分け**: 同じ値を2箇所に設定するが、用途が異なる。`.env` は**ローカルで `sam deploy` を実行するとき**に使う。GitHub Secrets は**GitHub Actions（CI/CD）が実行するとき**に使う。CI/CD だけ使う場合でも、最初の `sam deploy` はローカルから実行するため `.env` は必要。

### 4-2. ユーザー名について

S3 バケット名にはユーザー名が自動的に付与される設計になっている。`template.yaml` の `UserName` パラメータのデフォルト値を自分の名前に書き換える。

```yaml
# template.yaml（変更箇所のみ）
UserName:
  Type: String
  Default: 自分のユーザー名   # ← ここを書き換える（例: yamada）
```

### 4-3. SAM ビルド

`sam build` は Lambda 関数のソースコード（TypeScript）を本番用にコンパイル・パッケージングする処理。具体的には：

- `backend/` の TypeScript を JavaScript にトランスパイル（`esbuild` 使用）
- Lambda にアップロードできる形式（`.aws-sam/build/` 以下）に整形
- 依存パッケージ（`node_modules`）も含めてバンドル

ビルド結果は次のデプロイコマンドで参照される。コードを変更した場合は `sam deploy` の前に必ず再実行する。

```bash
sam build --profile line-rich-menu-app
```

### 4-5. SAM デプロイ（初回のみローカルから実行）

> **なぜローカルで実行するか**: `git push` すれば GitHub Actions が SAM デプロイを実行するが、デプロイが完了しないと `ApiUrl`・`CloudFrontUrl`・`WebhookUrl`・`CloudFrontDistributionId` の値がわからない。これらはこの後のステップ（constants.ts の更新・LINE 設定・GitHub Secrets 設定）で必要なため、先にローカルで実行して出力値を取得する。

以下のコマンドで DynamoDB・Lambda・API Gateway・S3・CloudFront をまとめて作成する。完了まで5〜10分かかる（CloudFront の作成は特に時間がかかる）。

**Mac / Linux:**

```bash
source .env && sam deploy \
  --parameter-overrides \
    LineChannelAccessToken=$LINE_CHANNEL_ACCESS_TOKEN \
    LineChannelSecret=$LINE_CHANNEL_SECRET \
  --profile line-rich-menu-app
```

**Windows（PowerShell）:**

```powershell
Get-Content .env | ForEach-Object {
  $key, $val = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
}
sam deploy `
  --parameter-overrides `
    LineChannelAccessToken=$env:LINE_CHANNEL_ACCESS_TOKEN `
    LineChannelSecret=$env:LINE_CHANNEL_SECRET `
  --profile line-rich-menu-app
```

### 4-6. 出力値の確認

デプロイ完了後、以下の値を確認してメモする。スタック名を変更した場合は `--stack-name` の値も変える。

```bash
# Mac / Linux
aws cloudformation describe-stacks \
  --stack-name line-rich-menu-app-stack \
  --query "Stacks[0].Outputs" \
  --profile line-rich-menu-app
```

```powershell
# Windows（PowerShell）
aws cloudformation describe-stacks `
  --stack-name line-rich-menu-app-stack `
  --query "Stacks[0].Outputs" `
  --profile line-rich-menu-app
```

| キー | 用途 |
|---|---|
| `ApiUrl` | `frontend/src/constants.ts` の `API_BASE_URL` に設定 |
| `CloudFrontUrl` | LIFF エンドポイント URL に設定 |
| `WebhookUrl` | LINE Developers の Webhook URL に設定 |
| `FrontendBucketName` | フロントエンドを手動アップロードする場合に使用 |
| `CloudFrontDistributionId` | GitHub Actions が CloudFormation から自動取得するため設定不要 |

---

## ステップ5：constants.ts の更新

`frontend/src/constants.ts` を開き、以下の2つの値を書き換える。

```typescript
// ステップ2で取得した LIFF ID
export const LIFF_ID = 'ここにLIFF IDを貼り付ける'

// ステップ4-4 の ApiUrl の値
export const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev'
```

---

## ステップ6：LINE の後続設定

AWS インフラが整ったので、LINE 側の設定を行う。

### 6-1. Webhook URL の設定

LINE Developers コンソール → Messaging API チャンネル → **Messaging API 設定** タブ → Webhook URL に `WebhookUrl` の値を設定し、「検証」ボタンで成功を確認する。詳細は **記事④「ステップ16-2」** を参照。

### 6-2. LIFF エンドポイント URL の更新

LINE Developers コンソール → LIFF チャンネル → LIFF タブ → エンドポイント URL を `CloudFrontUrl` の値に更新する。詳細は **記事④「ステップ16-1」** を参照。

### 6-3. リッチメニューの設定

LINE Official Account Manager でリッチメニューを作成する。詳細は **記事④「ステップ17〜18」** を参照。

---

## ステップ7：GitHub Secrets の設定と CI/CD の確認

### 7-1. GitHub Secrets の設定

**GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret**

| Secret 名 | 値 |
|---|---|
| `AWS_ROLE_ARN` | ステップ3で取得した IAM ロールの ARN |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers のチャンネルアクセストークン |
| `LINE_CHANNEL_SECRET` | LINE Developers のチャンネルシークレット |

### 7-2. constants.ts の変更を push して CI/CD を確認

ステップ5で更新した `constants.ts` を commit & push する。

```bash
git add frontend/src/constants.ts
git commit -m "update LIFF_ID and API_BASE_URL"
git push origin main
```

GitHub Actions が自動起動し、フロントエンドのビルドと S3 アップロード・CloudFront キャッシュ削除が実行される。以降は `git push` だけで自動デプロイが走る。

---

## 動作確認

LINE でボットを友達追加し、リッチメニューの各ボタンの動作を確認する。

| ボタン | 期待する動作 |
|---|---|
| 📝 入力フォーム | LIFF アプリが開き、家計簿の入力画面が表示される |
| 📊 今月の合計 | 今月の合計金額が返信される |
| 📋 最新の履歴 | 直近の履歴が返信される |
| 🐱 今日の猫 | 猫の画像が返信される |
| ❓ ヘルプ | Flex Message でヘルプ情報が表示される |
| 🚧 機能2 | 準備中メッセージが返信される |

友達追加と公開ステータスの変更手順は **記事④「ステップ19」** を参照。

