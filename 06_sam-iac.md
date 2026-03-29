# 【記事⑥】AWS × LINE 家計簿ボット — SAM で AWS インフラを一括構築する（応用編）

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。
>
> - 記事① AWS基盤 & 認証整備（IAM Identity Center）
> - 記事② ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）
> - 記事③ バックエンド実装（Node.js Lambda / DynamoDB）
> - 記事④ フロントエンドデプロイ + LINE連携 & 最終検証
> - 記事⑤ CI/CD（GitHub Actions による自動デプロイ）
> - **記事⑥** SAM で AWS インフラを一括構築する（本記事・応用編）

> **この記事の位置づけ**: 記事①〜④ではAWSコンソールを使って各リソースを手作業で作成した。本記事ではそれらを **SAM（AWS Serverless Application Model）** を使ってコード（`template.yaml` 1ファイル）で一括定義し、コマンド1つでデプロイする方法を解説する。**LINEの設定は記事②・④を参照**すること。

> **リソース名について**: 本記事では既存の手動作成リソース（記事①〜④で作ったもの）との名前衝突を避けるため、DynamoDB テーブル名・Lambda 関数名・API Gateway 名を `-v4` 系の名前にしている。これにより v3 環境を残したまま v4 環境を並行して作成・検証できる。動作確認後に v3 環境を削除するかどうかは任意。

---

## SAM とは何か

SAM（AWS Serverless Application Model）は AWS が提供する IaC（Infrastructure as Code）ツール。`template.yaml` というファイルにリソースの構成を書いておくと、コマンド1つで DynamoDB・Lambda・API Gateway・S3・CloudFront をまとめて作成・更新できる。

| 手作業（記事①〜④） | SAM（本記事） |
|---|---|
| コンソールでポチポチ設定 | `template.yaml` に書いてコマンド1つ |
| 設定の記録が残らない | Git でバージョン管理できる |
| 環境を再現するのが大変 | `sam deploy` で何度でも同じ構成を作れる |
| 順番を間違えると詰まる | SAM が依存関係を解決して順番通りに作成 |

SAM は AWS CloudFormation の拡張版で、Lambda・API Gateway・DynamoDB に特化した簡略記法が使える。S3・CloudFront のような汎用リソースは標準の CloudFormation 記法で書く。

---

## 前提条件

### AWS・ローカル環境

- 記事①の IAM Identity Center が設定済みで AWS CLI でログインできること
- Node.js 22.x がインストールされていること
- **SAM CLI** が[インストール](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/install-sam-cli.html)されていること

### LINE の設定（事前に完了しておく）

本記事では LINE 側の設定手順は扱わない。以下をすべて完了させてから本記事の手順を進めること。

| やること | 参照先 | 完了したら手元にメモする値 |
|---|---|---|
| LINE Developers でプロバイダー作成 | **記事②「ステップ4-1」** | − |
| Messaging API チャンネル作成 | **記事②「ステップ4-2」** | − |
| チャンネルアクセストークン発行 | **記事②「ステップ4-3」** | `LINE_CHANNEL_ACCESS_TOKEN` |
| チャンネルシークレット確認 | **記事②「ステップ4-3」** | `LINE_CHANNEL_SECRET` |
| LIFF アプリ作成・LIFF ID 取得 | **記事②「ステップ5」** | LIFF ID（`frontend/src/main.ts` に設定） |

> **LINE のトークン・シークレットはこのタイミングで手元に控えておく。** SAM デプロイ時のパラメータ入力と、フロントエンドコードの設定で使う。

LINE 側の残り設定（Webhook URL・LIFF エンドポイント URL・リッチメニュー）は AWS インフラを作成してから行う。本記事のステップ4にまとめて記載している。

---

## ステップ1：事前準備（IAM ロールの手動作成）

### 1-1. なぜ手動で作るのか

GitHub Actions が SAM（CloudFormation）を実行するには、AWS の IAM ロールが必要になる。しかし「SAM でそのロール自体を作る」ようにすると、**ロールがないとデプロイできない → デプロイしないとロールが作れない** という鶏と卵問題が起きる。

| 方針 | 結果 |
|---|---|
| IAM ロールを SAM（template.yaml）で管理 | 初回デプロイが必ず失敗 |
| **IAM ロールを手動で事前作成** ✅ | SAM がいつでもデプロイ可能 |

IAM ロールはアプリのビジネスロジックとは無関係な「デプロイ基盤」の設定であり、一度作れば変更することはほぼない。手動作成が適切。

### 1-2. 既存の OIDC プロバイダーの確認

記事⑤で `token.actions.githubusercontent.com` の OIDC プロバイダーを作成済みであれば、そのまま使う（再作成不要）。

```bash
# OIDCプロバイダーが存在するか確認
aws iam list-open-id-connect-providers --profile line-rich-menu-app
```

`token.actions.githubusercontent.com` が表示されれば OK。未作成の場合は記事⑤の「ステップ9-2」を先に実施する。

### 1-3. IAM ロールの作成

以下の2つのJSONファイルをプロジェクトルートに作成する。**`YOUR_GITHUB_ORG` だけ**自分の GitHub ユーザー名に書き換える。

**trust-policy.json**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
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

ファイルを作成したら以下を実行する。`${ACCOUNT_ID}` はコマンドで自動置換される。

**Mac / Linux:**

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text --profile line-rich-menu-app)
sed -i "s/\${ACCOUNT_ID}/$ACCOUNT_ID/" trust-policy.json

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

rm trust-policy.json deploy-policy.json
```

**Windows（PowerShell）:**

```powershell
$ACCOUNT_ID = (aws sts get-caller-identity --query "Account" --output text --profile line-rich-menu-app)
(Get-Content trust-policy.json) -replace '\$\{ACCOUNT_ID\}', $ACCOUNT_ID | Set-Content trust-policy.json

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

Remove-Item trust-policy.json, deploy-policy.json
```

出力された ARN（`arn:aws:iam::XXXXXXXXXXXX:role/github-actions-line-rich-menu-app-v4`）をメモしておく。ステップ6の GitHub Secrets 設定で使う。

---

## ステップ2：template.yaml の作成

プロジェクトのルート（`line-rich-menu-app/`）に `template.yaml` を作成する。これ1ファイルで以下のリソースをすべて定義する。

- DynamoDB テーブル
- Lambda 関数（esbuild でビルド）
- API Gateway（REST API）
- S3 バケット（フロントエンド用）
- CloudFront ディストリビューション

> **GitHub Actions 用 IAM ロールは手動作成（後述のステップ1-1参照）**: SAM がデプロイするにはIAMロールが必要だが、そのロールをSAMが作成しようとすると「ロールがないとデプロイできない、デプロイしないとロールが作れない」という鶏と卵問題が起きる。このため IAM ロールのみ事前に手動で作成する。

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Description: LINE 家計簿ボット（Lambda / DynamoDB / API Gateway / S3 / CloudFront）

# -------------------------------------------------------
# パラメータ（デプロイ時に値を渡す）
# -------------------------------------------------------
Parameters:
  LineChannelAccessToken:
    Type: String
    NoEcho: true
    Description: LINE チャネルアクセストークン
  LineChannelSecret:
    Type: String
    NoEcho: true
    Description: LINE チャネルシークレット

# -------------------------------------------------------
# Lambda のデフォルト設定（全 Function に適用）
# -------------------------------------------------------
Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [x86_64]
    Timeout: 15
    Environment:
      Variables:
        TABLE_NAME: !Ref LineBotTable

# -------------------------------------------------------
# リソース定義
# -------------------------------------------------------
Resources:

  # --- DynamoDB ---
  LineBotTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: line-bot-table-v4
      BillingMode: PAY_PER_REQUEST   # オンデマンド（使った分だけ課金）
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH   # パーティションキー
        - AttributeName: id
          KeyType: RANGE  # ソートキー

  # --- Lambda ---
  LineBotFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: line-bot-table-v4-handler
      CodeUri: backend/
      Handler: dist/index.handler
      Policies:
        - DynamoDBCrudPolicy:             # DynamoDB への読み書き権限を付与
            TableName: !Ref LineBotTable
      Environment:
        Variables:
          LINE_CHANNEL_ACCESS_TOKEN: !Ref LineChannelAccessToken
          LINE_CHANNEL_SECRET: !Ref LineChannelSecret
      Events:
        PostTransaction:
          Type: Api
          Properties:
            RestApiId: !Ref LineBotApi
            Path: /transaction
            Method: POST
        GetHistory:
          Type: Api
          Properties:
            RestApiId: !Ref LineBotApi
            Path: /history
            Method: GET
        GetSummary:
          Type: Api
          Properties:
            RestApiId: !Ref LineBotApi
            Path: /summary
            Method: GET
        PostWebhook:
          Type: Api
          Properties:
            RestApiId: !Ref LineBotApi
            Path: /webhook
            Method: POST
    # SAM の esbuild 統合（TypeScript を自動でビルド）
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Target: es2022
        EntryPoints:
          - src/index.ts
        External:
          - '@aws-sdk/*'   # Lambda 実行環境に同梱済みのため除外

  # --- API Gateway ---
  LineBotApi:
    Type: AWS::Serverless::Api
    Properties:
      Name: line-bot-api-v4
      StageName: dev
      Cors:
        AllowMethods: "'GET,POST,OPTIONS'"
        AllowHeaders: "'Content-Type'"
        AllowOrigin: "'*'"

  # --- S3 バケット（フロントエンドホスティング用）---
  FrontendBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: line-rich-menu-app-cicd
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  # --- CloudFront OAC（S3 への安全なアクセス制御）---
  CloudFrontOAC:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: line-rich-menu-app-oac
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  # --- S3 バケットポリシー（CloudFront からのみアクセス許可）---
  FrontendBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref FrontendBucket
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub "${FrontendBucket.Arn}/*"
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}"

  # --- CloudFront ディストリビューション ---
  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        DefaultRootObject: index.html
        Origins:
          - DomainName: !GetAtt FrontendBucket.RegionalDomainName
            Id: S3Origin
            OriginAccessControlId: !GetAtt CloudFrontOAC.Id
            S3OriginConfig:
              OriginAccessIdentity: ""  # OAC 使用時は空にする
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods: [GET, HEAD, OPTIONS]
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # AWS マネージドポリシー: CachingOptimized
        # SPA 用エラーハンドリング（Vue Router の履歴モード対応）
        CustomErrorResponses:
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
          - ErrorCode: 404
            ResponseCode: 200
            ResponsePagePath: /index.html

# -------------------------------------------------------
# デプロイ後に表示される出力値
# -------------------------------------------------------
Outputs:
  ApiUrl:
    Description: API Gateway のエンドポイント URL
    Value: !Sub "https://${LineBotApi}.execute-api.${AWS::Region}.amazonaws.com/dev"
  CloudFrontUrl:
    Description: CloudFront のドメイン URL（LIFF エンドポイントに設定する）
    Value: !Sub "https://${CloudFrontDistribution.DomainName}"
  WebhookUrl:
    Description: LINE Webhook URL（LINE Developers に設定する）
    Value: !Sub "https://${LineBotApi}.execute-api.${AWS::Region}.amazonaws.com/dev/webhook"
  FrontendBucketName:
    Description: フロントエンドをアップロードする S3 バケット名（GitHub Actions で使用）
    Value: !Ref FrontendBucket
  CloudFrontDistributionId:
    Description: CloudFront ディストリビューション ID（キャッシュ削除・GitHub Actions で使用）
    Value: !Ref CloudFrontDistribution
  LambdaFunctionName:
    Description: Lambda 関数名（GitHub Actions で使用）
    Value: !Ref LineBotFunction
```

> **`Metadata: BuildMethod: esbuild` について**: SAM の esbuild 統合を使うと、手動で `npm run build` → ZIP → アップロード という手順が不要になる。`sam build` が TypeScript のコンパイル＋バンドルを自動で行い、`sam deploy` がそのまま Lambda にアップロードする。

---

## ステップ3：SAM のビルドとデプロイ

### 3-1. SAM CLI の認証設定

SAM CLI は AWS CLI のプロファイルを使う。

```bash
# SSO ログイン（セッションが切れている場合）
aws sso login --profile line-rich-menu-app
```

### 3-2. backend/package.json の準備

SAM の esbuild ビルド統合は `npm install --production` を使うため、esbuild が `devDependencies` に入っていると無視される。`backend/package.json` を以下の内容に書き換える。

```json
{
  "name": "backend",
  "version": "1.0.0",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js --external:@aws-sdk/*",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "esbuild": "^0.27.4"
  },
  "devDependencies": {
    "@aws-sdk/client-dynamodb": "^3.1019.0",
    "@aws-sdk/lib-dynamodb": "^3.1019.0",
    "@types/aws-lambda": "^8.10.161",
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2"
  }
}
```

> **ポイント**: `esbuild` だけを `dependencies` に置く。`@aws-sdk/*` は Lambda 実行環境に同梱済みのため `devDependencies` のままでよい（esbuild がバンドル時に除外する）。

書き換えたら `node_modules` を再インストールする。

```powershell
cd backend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
cd ..
```

### 3-3. ビルド

`template.yaml` がある `line-rich-menu-app/` フォルダで実行する。

```bash
sam build --profile line-rich-menu-app
```

成功すると `.aws-sam/build/` にビルド成果物が生成される。

```
.aws-sam/
└── build/
    ├── template.yaml        ← 解決済みのテンプレート
    └── LineBotFunction/
        └── dist/
            └── index.js     ← バンドル済みの Lambda コード
```

### 3-4. 設定ファイルの準備（事前設定で対話なしデプロイ）

**初回から対話形式（`--guided`）は不要。** 以下の設定ファイルを事前に用意しておけば、初回も2回目以降も同じコマンドで完結する。**秘匿情報は `.env` に分離して Git に含めない**のがポイント。

> **`--guided` が何をしているか**: 対話形式は `samconfig.toml` を自動生成するウィザードにすぎない。自分で `samconfig.toml` を書けば `--guided` は一切不要。唯一の注意点として `--guided` はデプロイ用の S3 バケットも自動作成するが、`samconfig.toml` に `resolve_s3 = true` を書いておけば同じことを自動でやってくれる。

**① `samconfig.toml` を作成する（プロジェクトルートに配置）**

デプロイの設定値を書いておくファイル。Git にコミットしてよい。

```samconfig.toml
version = 0.1

[default.build.parameters]
cached = true

[default.deploy.parameters]
stack_name        = "line-rich-menu-app-stack"
s3_prefix         = "line-rich-menu-app-stack"
region            = "ap-northeast-1"
capabilities      = "CAPABILITY_IAM"
confirm_changeset = false
disable_rollback  = false
resolve_s3        = true
```

> **`profile` を書かない理由**: `profile` を `samconfig.toml` に書くと GitHub Actions 実行時に `The config profile () could not be found` エラーになる。ローカル実行時は `--profile line-rich-menu-app` をコマンドに直接付ける。CI/CD では OIDC 認証を使うため `--profile` 不要。
>
> **`s3_bucket` を書かない理由**: `resolve_s3 = true` で SAM がデプロイ用の内部バケットを自動作成・管理する。フロントエンド用の `line-rich-menu-app-cicd` とは別物なので指定不要。

**② `.env` を作成する（プロジェクトルートに配置）**

LINEトークンなど秘匿情報を書くファイル。**必ず `.gitignore` に追加して Git に含めないこと。**

```bash
# .env（Git には含めない）
LINE_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークンを貼り付ける
LINE_CHANNEL_SECRET=ここにチャネルシークレットを貼り付ける
```

> **LINE チャネルアクセストークン・チャネルシークレットの確認方法**: **記事②「ステップ4-3」** を参照。

**③ `.gitignore` に `.env` を追加する**

```bash
# .gitignore（既存ファイルに追記）
.env
```

**④ デプロイする（2回目以降もこのコマンドをそのまま使う）**

Mac / Linux:

```bash
source .env && sam deploy \
  --parameter-overrides \
    LineChannelAccessToken=$LINE_CHANNEL_ACCESS_TOKEN \
    LineChannelSecret=$LINE_CHANNEL_SECRET \
  --profile line-rich-menu-app
```

Windows（PowerShell）:

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

> **なぜ `.env` を使うか**: `samconfig.toml` に直接トークンを書くと Git に混入するリスクがある。`.env` に分離して `.gitignore` で除外することで、設定値はローカルにだけ残る。

デプロイが開始され、CloudFormation のスタックが作成される。完了まで数分かかる（CloudFront の作成は特に時間がかかる）。

```
CloudFormation events from stack operations (refresh every 5.0 seconds)
CREATE_IN_PROGRESS  AWS::DynamoDB::Table        LineBotTable
CREATE_COMPLETE     AWS::DynamoDB::Table        LineBotTable
CREATE_IN_PROGRESS  AWS::Lambda::Function       LineBotFunction
...
CREATE_COMPLETE     AWS::CloudFront::Distribution  CloudFrontDistribution

Successfully created/updated stack - line-rich-menu-app-stack in ap-northeast-1
```

### 3-5. 出力値の確認

デプロイ完了後、以下のコマンドで出力値を確認する。

```bash
aws cloudformation describe-stacks --stack-name line-rich-menu-app-stack --query "Stacks[0].Outputs" --profile line-rich-menu-app
```

以下の値が表示される。後続の手順で使うため、メモしておく。

| キー | 用途 |
|---|---|
| `ApiUrl` | フロントエンドの `constants.ts` に設定 |
| `CloudFrontUrl` | LIFF エンドポイント URL に設定 |
| `WebhookUrl` | LINE Developers の Webhook URL に設定 |
| `FrontendBucketName` | フロントエンドをアップロードする S3 バケット名 |
| `CloudFrontDistributionId` | CloudFront キャッシュ削除・GitHub Secrets に設定 |

---

## ステップ4：フロントエンドのビルドと S3 アップロード

フロントエンドは SAM の管轄外（静的ファイルのため）。手動またはCI/CDでアップロードする。

### 4-1. API URL の設定

`frontend/src/constants.ts` の `API_BASE_URL` を、ステップ2-4 で確認した `ApiUrl` の値に更新する。

```typescript
export const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev'
```

## ステップ5：LINE の設定

AWS インフラが整ったら、LINE 側の設定を行う。手順は既存記事を参照すること。

| 設定項目 | 参照記事 | 設定する値 |
|---|---|---|
| LIFF アプリの作成・LIFF ID の取得 | **記事②「ステップ5」** | − |
| LIFF エンドポイント URL の更新 | **記事④「ステップ16-1」** | `CloudFrontUrl` の値 |
| LINE Webhook URL の設定 | **記事④「ステップ16-2」** | `WebhookUrl` の値 |
| リッチメニューの作成 | **記事④「ステップ17」** | − |
| 友だち追加・公開設定 | **記事④「ステップ19」** | − |

> **この記事 + LINE の設定 = 動作するアプリ**: ステップ1〜3 で AWS インフラとフロントエンドのデプロイが完了する。あとは上の表の LINE 設定を完了させれば、スマホで家計簿ボットが使える状態になる。

---

## ステップ6：GitHub Actions による CI/CD（SAM 版）

SAM を使う場合、記事⑤の CI/CD ワークフローを SAM 向けに置き換えることで、`git push` だけで全リソースの更新が自動化できる。

### 6-1. samconfig.toml の確認

ステップ2-4 で作成した `samconfig.toml` がリポジトリにコミットされていることを確認する（`profile` なし・`s3_bucket` なし）。

```toml
version = 0.1

[default.build.parameters]
cached = true

[default.deploy.parameters]
stack_name        = "line-rich-menu-app-stack"
s3_prefix         = "line-rich-menu-app-stack"
region            = "ap-northeast-1"
capabilities      = "CAPABILITY_IAM"
confirm_changeset = false
disable_rollback  = false
resolve_s3        = true
```

> **`profile` を書かないのがポイント。** CI/CD 環境にはローカルの AWS プロファイルが存在しないため、`profile` が含まれていると `The config profile () could not be found` エラーになる。ローカルでは `--profile` をコマンドに都度付けて実行する。

### 6-2. GitHub Secrets の設定

**GitHub リポジトリ ＞ Settings ＞ Secrets and variables ＞ Actions ＞ [New repository secret]**

| Secret 名 | 値の確認方法 |
|---|---|
| `AWS_ROLE_ARN` | ステップ1-3 で作成した IAM ロールの ARN（`arn:aws:iam::XXXXXXXXXXXX:role/github-actions-line-rich-menu-app-v4`） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers ＞ チャンネル基本設定 |
| `LINE_CHANNEL_SECRET` | LINE Developers ＞ チャンネル基本設定 |
| `CLOUDFRONT_DISTRIBUTION_ID` | `sam deploy` 後の Outputs `CloudFrontDistributionId` の値 |

> **`AWS_ROLE_ARN` について**: ステップ1-3 で手動作成したロールの ARN をそのまま使う。記事⑤で作成した旧ロール（`github-actions-line-rich-menu-app`）と区別するため、v4 用に新規作成したロールを使う点に注意。

### 6-3. 旧ワークフローファイルの整理

記事⑤で作成した `deploy-backend.yml` / `deploy-frontend.yml` が残っていると `deploy.yml` と二重に動いてしまう。以下のコマンドで削除する。

```powershell
Remove-Item .github/workflows/deploy-backend.yml
Remove-Item .github/workflows/deploy-frontend.yml
```

### 6-4. GitHub Actions ワークフロー（SAM 版・deploy.yml）

`.github/workflows/deploy.yml` を以下の内容で作成（または置き換え）する。バックエンド（SAM）とフロントエンドを1ファイルにまとめている。

```yaml
name: Deploy（SAM + Frontend）

on:
  push:
    branches: [main]

permissions:
  id-token: write   # OIDC 認証に必要
  contents: read

jobs:
  # -------------------------------------------------------
  # ① バックエンド + インフラ: SAM でまとめてデプロイ
  # -------------------------------------------------------
  deploy-backend:
    name: SAM Build & Deploy（Lambda / API Gateway / DynamoDB）
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup SAM CLI
        uses: aws-actions/setup-sam@v2

      - name: Configure AWS credentials（OIDC）
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1

      - name: SAM Build
        # esbuild で TypeScript をビルド
        run: sam build

      - name: SAM Deploy
        # samconfig.toml の設定を使い、LINE トークンはシークレットから渡す
        # 各パラメータを "" で囲むことで特殊文字を含む値でも正しく渡せる
        run: |
          sam deploy \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset \
            --parameter-overrides \
              "LineChannelAccessToken=${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}" \
              "LineChannelSecret=${{ secrets.LINE_CHANNEL_SECRET }}"

  # -------------------------------------------------------
  # ② フロントエンド: ビルド → S3 → CloudFront キャッシュ削除
  # -------------------------------------------------------
  deploy-frontend:
    name: Frontend Build & Deploy（S3 / CloudFront）
    runs-on: ubuntu-latest
    needs: deploy-backend   # バックエンドデプロイ後に実行
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Configure AWS credentials（OIDC）
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1

      - name: Install dependencies
        run: npm ci
        working-directory: frontend

      - name: Build frontend
        run: npm run build
        working-directory: frontend

      - name: Upload to S3
        run: |
          BUCKET=$(aws cloudformation describe-stacks \
            --stack-name line-rich-menu-app-stack \
            --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
            --output text)
          aws s3 sync dist/ s3://$BUCKET --delete
        working-directory: frontend

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

> **`needs: deploy-backend` について**: フロントエンドの S3 アップロードはバックエンドのデプロイが完了した後に実行される。これにより API Gateway の URL が確定してから CloudFront キャッシュが更新される。

---

## ステップ7：スタックの削除（後片付け）

作成した AWS リソースをまとめて削除する場合は以下のコマンドを実行する。**S3 バケットにファイルが残っていると削除が失敗するため、先に空にすること。**

```bash
# S3 バケットを空にする
aws s3 rm s3://YOUR_FRONTEND_BUCKET_NAME --recursive --profile line-rich-menu-app

# SAM スタックごと全リソースを削除
sam delete --stack-name line-rich-menu-app-stack --profile line-rich-menu-app
```

> **コンソールでの削除**: AWS コンソール ＞ CloudFormation ＞ `line-rich-menu-app-stack` ＞ **[削除]** でも同様に全リソースをまとめて削除できる。

---

## 手作業との比較まとめ

| 項目 | 手作業（記事①〜④） | SAM（本記事） |
|---|---|---|
| DynamoDB 作成 | コンソールでポチポチ | `template.yaml` に定義済み |
| Lambda 作成・設定 | コンソール + ZIP アップロード | `sam build && sam deploy` |
| API Gateway 設定 | 4エンドポイントを手動作成 | `template.yaml` に定義済み |
| S3 + CloudFront 設定 | コンソールで手順通り | `template.yaml` に定義済み |
| 環境の再現 | 手順書を見ながらやり直し | `sam deploy` 1コマンド |
| CI/CD | 記事⑤のワークフロー | SAM 版ワークフローに差し替え |
| リソース削除 | 各サービスを個別に削除 | `sam delete` 1コマンド |

---

### ✅ 完了チェック

- [ ] SAM CLI がインストールされている（`sam --version` で確認）
- [ ] GitHub Actions 用 IAM ロール（`github-actions-line-rich-menu-app-v4`）を手動作成した
- [ ] IAM ロールの ARN をメモした
- [ ] `template.yaml` がプロジェクトルートに作成されている
- [ ] `backend/package.json` で esbuild が `dependencies` に入っている
- [ ] `samconfig.toml` がプロジェクトルートに作成されている（`profile` なし・`resolve_s3 = true`）
- [ ] `.env` に `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_CHANNEL_SECRET` を設定した
- [ ] `.env` が `.gitignore` に追加されている
- [ ] `sam build --profile line-rich-menu-app` が成功している
- [ ] `sam deploy` が成功しスタックが `CREATE_COMPLETE` になっている
- [ ] Outputs（`ApiUrl` / `CloudFrontUrl` / `WebhookUrl` / `CloudFrontDistributionId` / `FrontendBucketName`）を確認した
- [ ] フロントエンドの `constants.ts` に `ApiUrl` を設定した
- [ ] 旧ワークフローファイル（`deploy-backend.yml` / `deploy-frontend.yml`）を削除した
- [ ] `deploy.yml` を GitHub Actions に設定し `AWS_ROLE_ARN` 等の Secrets を登録した
- [ ] LINE の�                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           