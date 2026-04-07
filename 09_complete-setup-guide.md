# 【記事⑨】AWS × LINE 家計簿ボット — git clone から動かすまでの完全手順書

## 概要
本リポジトリのコードは、AIに分析させて内容を把握してください。

本ドキュメント自体もAIで生成しているため、内容の正確性は自律的に検証しながら進めることを前提としています。実装の全体像については、[アーキテクチャ資料 (08_architecture.md)](https://github.com/tmoritoki0227/line-rich-menu-app/blob/main/08_architecture.md)も併せて参考にしてください。

なお、リポジトリには本ガイドで触れていない「モバイルオーダー機能」のコードも含まれていますが、学習の過程で適宜読み飛ばしてください。

## この記事でやること

| # | 作業 | 所要時間の目安 |
|---|---|---|
| 1 | リポジトリのクローンと依存インストール | 5分 |
| 2 | LINE チャンネル・LIFF の初期設定 | 15分 |
| 3 | GitHub Actions 用 IAM ロールの作成 | 10分 |
| 4 | `.env` の作成・SAM ビルド・SAM デプロイ | 20分 |
| 5 | `constants.ts` の更新 | 5分 |
| 6 | LINE の後続設定（Webhook・LIFF エンドポイント） | 10分 |
| 7 | リッチメニューの作成 | 15分 |
| 8 | GitHub Secrets の設定と CI/CD の確認 | 10分 |
| 9 | 動作確認・友だちへの公開 | 10分 |

---

## 前提条件

以下がすべて完了していること。

| 条件 | 参照 |
|---|---|
| AWS アカウントがあり IAM Identity Center が設定済み | — |
| `aws sso login --profile line-rich-menu-app` でログインできる | — |
| Node.js 24.x がインストールされている | [公式インストール手順](https://nodejs.org/ja) |
| GitHub アカウントがあり、リポジトリの fork または push 権限がある | — | |
| SAM CLI がインストールされている | [公式インストール手順](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| GitHub アカウントがあり、リポジトリの fork または push 権限がある | — |
| LINE アカウントがある | — |

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

### 2-1. プロバイダーと Messaging API チャンネルの作成

> ⚠️ この手順は LINE アカウントで行う。

1. [LINE Developers コンソール](https://developers.line.biz/console/) にアクセスしてログイン。
2. **[作成]** をクリックし、「新規プロバイダー作成」をする。
   - 名前: 任意（例: `勉強会用`）を入力して作成。
3. 画面中央の **[Messaging API]** アイコンをクリック。
4. **「Messaging API チャンネルの作成」** 画面で、緑色の **[LINE 公式アカウントを作成する]** ボタンをクリック。
5. **「LINE 公式アカウントの作成」** 画面で以下を入力する。
   - **アカウント名**: 任意（例: `家計簿ボット`）
   - **メールアドレス**: 自分のアドレス
   - **会社・事業者の所在地・地域**: 日本
   - **業種**: 大業種「個人」、小業種「個人（IT・コンピュータ）」
   - **運用目的**: 「その他」にチェック / **主な使い方**: 「未定」
   - **ビジネスマネージャーの組織との接続方法**: **[ビジネスマネージャーの組織を作成]** にチェック
6. 一番下の **[確認]** ＞ **[完了]** をクリック。
   - 「LINE ヤフー for Business を友だち追加」のチェックは**外す**。
7. **「LINE 公式アカウントが作成されました」** 画面で **[LINE Official Account Manager へ]** をクリック。
8. **「情報利用に関する同意について」** 画面で **[同意]** をクリック。
9. **「LINE ヤフーグループへの情報提供に関する個別規約への同意について」** 画面で **[同意]** をクリック。
10. **「運用をはじめる前に (1/2)」** で **[次へ]**、**「まずは友だちを集めましょう (2/2)」** で **[ホーム画面に移動]** をクリック。
11. 管理画面（LINE Official Account Manager）の右上 **[設定]** ＞ 左メニュー **[Messaging API]** ＞ **[Messaging API を利用する]** をクリック。
12. **「プロバイダーを選択」** 画面で作成したプロバイダーにチェックを入れ ＞ **[同意する]** をクリック。
13. **「プライバシーポリシーと利用規約」** 画面は2つの入力欄（https://?）を**空欄**のまま **[OK]** をクリック。
14. **「Messaging API を利用」** 案内で **[OK]** をクリック。
15. **[LINE Developers コンソール]** という青いリンクをクリックして戻る。
16. LINE Developers ＞ 作成したプロバイダー ＞ 作成したチャンネルをクリック。

### 2-2. チャンネルアクセストークンとシークレットの取得

1. **[Messaging API 設定]** タブ ＞ 一番下の **[チャンネルアクセストークン]** ＞ **[発行]** をクリック。
   - 表示された長い英数字をコピーして保存する。→ **`LINE_CHANNEL_ACCESS_TOKEN`**
2. **[チャンネル基本設定]** タブ ＞ 画面中央の **チャンネルシークレット** をコピーして保存する。→ **`LINE_CHANNEL_SECRET`**

> **保存先**: この2つの値は後のステップで `.env` と GitHub Secrets に設定する。コードにハードコードしない。

### 2-3. 応答設定の変更

1. [LINE Official Account Manager](https://manager.line.biz/) ＞ 作成したアカウントを選択。
2. **[設定]** ＞ **[応答設定]**。
3. **応答メッセージ**: オフ
4. **あいさつメッセージ**: オフ

> Webhook で自前の返信を制御するため、自動応答をオフにする。

### 2-4. LINE ログインチャンネルと LIFF アプリの作成

LIFF は LINE のチャット画面の上に表示する Web アプリの仕組み。LIFF を使うには「LINE ログイン」チャンネルが別途必要になる。

1. LINE Developers ＞ 画面左上のパンくずリストからプロバイダーをクリックして戻る。
2. **[新規チャンネル作成]** ＞ 一番左の **[LINE ログイン]** を選択。
3. 以下の情報を入力して作成する。
   - **会社・事業者の所在国・地域**: 日本
   - **チャンネル名**: 任意（例: `家計簿LIFF`）
   - **チャンネル説明**: 任意（例: `入力フォーム用チャンネル`）
   - **アプリのタイプ**: **[ウェブアプリ]** に必ずチェックを入れる
   - **2要素認証の必須化**: オフ
   - **メールアドレス**: 自分のアドレス
   - 「LINE 開発者契約に同意します。」にチェック
4. **[作成]** ＞ **[同意する]**。
5. 作成した LIFF チャンネル ＞ **[LIFF]** タブ ＞ **[追加]** をクリック。
6. 以下の内容で設定する。

   | 項目 | 値 |
   |---|---|
   | LIFF アプリ名 | 任意（例: `入力フォーム`） |
   | サイズ | `Full` |
   | エンドポイント URL | `https://example.com`（※ダミーでOK。ステップ6で正しいURLに差し替える） |
   | Scopes | `profile` と `chat_message.write` にチェック |
   | 友だち追加オプション | `On (Normal)` |

7. 一番下の **[追加]** をクリック。
8. 発行された `https://liff.line.me/〜` の URL をコピーして保存する。

> **LIFF ID とは**: `https://liff.line.me/` の後ろの部分（例: `2009623278-XXXXXXXX`）のこと。→ **`LIFF_ID`** としてメモしておく。ステップ5で `constants.ts` に設定する。

> **⚠️ エンドポイント URL について**: LIFF の登録には URL が必須だが、この時点ではまだ CloudFront が存在しないためダミー URL で登録する。ステップ6で正しい URL へ更新する手順がある。

---

## ここまでで手元にあるべき値

| 値 | 用途 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | ステップ4の `.env`・ステップ8の GitHub Secrets |
| `LINE_CHANNEL_SECRET` | ステップ4の `.env`・ステップ8の GitHub Secrets |
| `LIFF_ID` | ステップ5の `constants.ts` |

---

## ステップ3：GitHub Actions 用 IAM ロールの作成

GitHub Actions が AWS にデプロイするための IAM ロールを手動で作成する。

> **なぜ手動で作るのか**: GitHub Actions が SAM デプロイするには IAM ロールが必要。しかし「SAM でそのロール自体を作る」ようにすると、ロールがないとデプロイできない → デプロイしないとロールが作れない、という鶏と卵問題が起きる。このため IAM ロールのみ事前に手動作成する。

以下の2つの JSON ファイルをプロジェクトルートに作成する（VSCode 等で作成）。**`YOUR_ACCOUNT_ID`** を自分の AWS アカウント ID、**`YOUR_GITHUB_ORG`** を自分の GitHub ユーザー名に書き換える。

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

出力された ARN（`arn:aws:iam::XXXXXXXXXXXX:role/github-actions-line-rich-menu-app-v4`）をメモしておく。→ **`AWS_ROLE_ARN`** としてステップ8の GitHub Secrets 設定で使う。

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

### 4-4. SAM デプロイ（初回のみローカルから実行）

> **なぜローカルで実行するか**: `git push` すれば GitHub Actions が SAM デプロイを実行するが、デプロイが完了しないと `ApiUrl`・`CloudFrontUrl`・`WebhookUrl` の値がわからない。これらはこの後のステップ（constants.ts の更新・LINE 設定）で必要なため、先にローカルで実行して出力値を取得する。

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

### 4-5. 出力値の確認

デプロイ完了後、以下のコマンドで出力値を確認してメモする。

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
| `ApiUrl` | ステップ5の `constants.ts` の `API_BASE_URL` に設定 |
| `CloudFrontUrl` | ステップ6で LIFF エンドポイント URL に設定 |
| `WebhookUrl` | ステップ6で LINE Developers の Webhook URL に設定 |

---

## ステップ5：constants.ts の更新

`frontend/src/constants.ts` を開き、以下の値を書き換える。

```typescript
// ステップ2で取得した LIFF ID
export const LIFF_ID = 'ここに LIFF ID を貼り付ける'

// モバイルオーダー用 LIFF ID（モバイルオーダー機能を使う場合）
export const ORDER_LIFF_ID = 'ここにモバイルオーダー用 LIFF ID を貼り付ける'

// ステップ4-5 の ApiUrl の値
export const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev'
```

> モバイルオーダー機能を使わない場合は `ORDER_LIFF_ID` は空のままでよい。

---

## ステップ6：LINE の後続設定

AWS インフラが整ったので、LINE 側の設定を行う。

### 6-1. LIFF エンドポイント URL の更新

ステップ2で LIFF アプリに登録したエンドポイント URL（ダミーの `https://example.com`）を、CloudFront の URL に更新する。

1. [LINE Developers コンソール](https://developers.line.biz/console/) ＞ プロバイダー ＞ LIFF チャンネル ＞ **[LIFF]** タブ。
2. 作成した LIFF アプリの **[編集]** をクリック。
3. **「エンドポイント URL」** をステップ4-5 の `CloudFrontUrl` の値に変更する。

```
https://xxxxxxxxxxxx.cloudfront.net
```

4. **[更新]** をクリック。

### 6-2. LINE Webhook URL の登録

LINE からのメッセージを Lambda で受け取るために、Webhook URL を登録する。

1. LINE Developers ＞ プロバイダー ＞ Messaging API チャンネル ＞ **[Messaging API 設定]** タブ。
2. **「Webhook URL」** の **[編集]** をクリック。
3. ステップ4-5 の `WebhookUrl` の値を入力する。

```
https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/webhook
```

4. **[更新]** ＞ **[検証]** をクリック。
   - 「成功」と表示されれば正常に Lambda に接続できている。
5. **「Webhook の利用」** を **ON** に切り替える。

---

## ステップ7：リッチメニューの作成

リッチメニューとは LINE のトーク画面下部に常時表示できるメニュー。2行×3列の6分割レイアウトで、以下の6つのアクションを割り当てる。

### 7-1. ボタン画像の準備（Canva が便利）

リッチメニューには画像を貼ることができ、各ボタンにラベルやアイコンを入れると視認性が上がる。**[Canva](https://www.canva.com/)** を使うと無料で簡単に作成できるのでおすすめ。

**Canva での作成手順:**

1. Canva を開き、**[カスタムサイズ]** で `2500 × 1686 px` のデザインを作成する。
2. 2行×3列のガイド線を引いて6つのエリアに分割する。
3. 各エリアに以下のラベルを入れる。

| エリア | 推奨ラベル（画像に書く文字） | プログラムとの対応 |
|---|---|---|
| A（左上） | 📝 入力フォーム | LIFF フォームを開く |
| B（中上） | 📊 今月の合計 | 「合計」を送信 → 当月合計を返す |
| C（右上） | 📋 最新の履歴 | 「最新の履歴を表示」を送信 → 最新5件を返す |
| D（左下） | 🐱 今日の猫 | 猫画像サイトへのリンク |
| E（中下） | ❓ ヘルプ | 「ヘルプ」を送信 → 操作メニューカードを返す |
| F（右下） | 🚧 機能2 | 「機能2」を送信 → 準備中メッセージを返す |

> **ポイント**: タイプが「テキスト」のボタンは、設定した文字列がそのまま LINE に送信されてプログラムが受け取る。画像のラベルはあくまで見た目用なので、プログラムが動くかどうかはテキスト設定の値が正しいかで決まる。

4. デザインが完成したら **[PNG でダウンロード]** する。

### 7-2. リッチメニューの作成手順

1. [LINE Official Account Manager](https://manager.line.biz/) ＞ 作成したアカウント ＞ 左メニュー **[ホーム]** ＞ **[リッチメニュー]** ＞ **[作成]** をクリック。

2. **「表示設定」** セクション:
   - タイトル: `メニュー`（任意）
   - 表示期間: 開始日を「今日」に設定 ＞ 終了日は設定しない（制限なし）

3. **「コンテンツ設定」** ＞ **[テンプレートを選択]** をクリック ＞ **6分割（2行×3列）** のレイアウトを選択 ＞ **[適用]**。

4. **リッチメニュー画像のアップロード**:
   - **[画像をアップロード]** をクリックし、Canva でダウンロードした PNG をアップロードする。
   - 画像を使わない場合はテキスト設定だけでもよい。
   - 推奨サイズ: 2500 × 1686 px（LINE 公式の推奨サイズ）。

5. **エリア A（左上）** をクリックして設定する。
   - タイプ: `リンク`
   - URL: `https://liff.line.me/（LIFF ID）`
   - アクションラベル: `入力フォーム`

   > **LIFF URL の確認方法**: LINE Developers ＞ LIFF チャンネル ＞ LIFF タブ ＞ 発行された `https://liff.line.me/〜` の URL をコピー。

6. **エリア B（中上）** をクリックして設定する。
   - タイプ: `テキスト`
   - テキスト: `合計`

   > **テキストタイプについて**: タイプを「テキスト」にするとアクションラベルの入力欄はなく、テキストフィールドに入れた文字がそのまま送信される（かつボタンのラベルにもなる）。

7. **エリア C（右上）** をクリックして設定する。
   - タイプ: `テキスト`
   - テキスト: `最新の履歴を表示`

8. **エリア D（左下）** をクリックして設定する。
   - タイプ: `リンク`
   - URL: `https://cataas.com/cat`
   - アクションラベル: `今日の猫`

9. **エリア E（中下）** をクリックして設定する。
   - タイプ: `テキスト`
   - テキスト: `ヘルプ`

   > **動作**: 「ヘルプ」と送信するとボット側で Flex Message（操作メニューカード）を返す。カード内のボタンをタップするとキーワードがチャットに送信される。

10. **エリア F（右下）** をクリックして設定する。
    - タイプ: `テキスト`
    - テキスト: `機能2`

    > **動作**: 「機能2」と送信すると「🚧 この機能は現在準備中です。」と返る。未実装機能のプレースホルダーとして使う。

11. **[保存]** をクリックし、確認画面で **[公開]** をクリック。

> **動作確認**: スマホで LINE を開き、作成したアカウントのトーク画面下部に6分割のリッチメニューが表示されていれば成功。

### 7-3. プロフィールアイコンの変更（任意）

デフォルトのアイコンをカスタム画像に変えることで、トーク画面での見栄えが良くなる。

1. [LINE Official Account Manager](https://manager.line.biz/) ＞ 作成したアカウントを選択。
2. 左メニュー **[ホーム]** ＞ 右上の **[設定]** をクリック。
3. 左メニュー **[アカウント設定]** をクリック。
4. **「基本情報」** セクション ＞ アイコン画像の **[変更]** をクリック。
5. 使いたい画像をアップロード（JPG / PNG 推奨、正方形が見栄え良い）＞ **[適用]** ＞ **[保存]**。

---

## ステップ8：GitHub Secrets の設定と CI/CD の確認

### 8-1. GitHub Secrets の設定

**GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret**

| Secret 名 | 値 |
|---|---|
| `AWS_ROLE_ARN` | ステップ3で取得した IAM ロールの ARN |
| `LINE_CHANNEL_ACCESS_TOKEN` | ステップ2-2 で取得したチャンネルアクセストークン |
| `LINE_CHANNEL_SECRET` | ステップ2-2 で取得したチャンネルシークレット |

> **`CLOUDFRONT_DISTRIBUTION_ID` は不要**: ワークフローが CloudFormation の Outputs から自動取得するため、Secrets への登録は不要。

### 8-2. constants.ts の変更を push して CI/CD を確認

ステップ5で更新した `constants.ts` を commit & push する。

```bash
git add frontend/src/constants.ts
git commit -m "update LIFF_ID and API_BASE_URL"
git push origin main
```

GitHub Actions が自動起動し、以下が順番に実行される。

1. **Backend**: SAM ビルド → Lambda / API Gateway / DynamoDB / S3 / CloudFront を更新
2. **Frontend**: Vue アプリをビルド → S3 にアップロード → CloudFront キャッシュ削除

以降は `git push` だけで自動デプロイが走る。

---

## ステップ9：動作確認と友だちへの公開

### 9-1. 友だち追加と基本動作確認

1. スマホで LINE を開き、作成したボットを**友だち追加**する。
   - LINE Developers ＞ Messaging API チャンネル ＞ **[Messaging API 設定]** タブ ＞ QR コードをスマホで読み取る。
2. トーク画面下部に6分割のリッチメニューが表示されていることを確認する。
3. **「📝 入力フォーム」** をタップ ＞ LIFF フォームが開くことを確認する。

### 9-2. 家計簿の記録テスト

1. LIFF フォームで以下を入力して **[保存する]** をタップ。
   - 日付: 今日
   - 金額: 1000
   - 品物: テスト
2. LINE のトーク画面に「💰 家計簿記録完了！」というメッセージが届くことを確認する。

### 9-3. LINE キーワードのテスト

以下のキーワードを LINE のトーク画面（またはリッチメニューのボタン）から送信して、それぞれ正しく返信が来ることを確認する。

| 送信テキスト | 期待する返信 |
|---|---|
| `合計` | 📊 〇〇年〇月の合計: 1,000円 |
| `最新の履歴を表示` | 📋 最新N件の履歴（日付・時間・品物・金額） |
| `ヘルプ` | Flex Message（操作メニューカード）が表示される |
| `機能2` | 🚧 この機能は現在準備中です。 |

### 9-4. 期間集計テスト

1. LIFF フォームをもう一度開き、「📊 期間集計」カードで当月1日〜今日を選択して **[集計する]** をタップ。
2. 合計金額が表示されることを確認する。

### 9-5. 友だちへの公開（任意）

> **自分だけで使う場合はこの手順は不要。** 自分のスマホで友だち追加して使うだけなら、開発中ステータスのままで問題なく動く。家族や友人にも使ってもらいたい場合のみ実施する。

自分以外の人がボットを使えるようにするには、LIFF チャンネルの公開ステータスを変更する必要がある。デフォルトでは「開発中」状態のため、管理者（自分）以外は LIFF アプリ（入力フォーム）にログインできない。

> **Messaging API チャンネルにはステータスがない。** ボットへの友だち追加は開発中のままでも誰でも可能。公開が必要なのは **LINE ログインチャンネル（LIFF 用）** のみ。

**LIFF チャンネルを公開状態にする手順:**

1. [LINE Developers](https://developers.line.biz/) ＞ プロバイダーを選択する。
2. プロバイダー内のチャンネル一覧から LIFF 用の **LINE ログインチャンネル**をクリックして開く。
3. チャンネル設定画面が開いたら **[チャンネル基本設定]** タブをクリックする。
4. ページ下部の **「チャンネルステータス」** を確認する。
   - `開発中` と表示されている場合は隣の **[公開する]** ボタンをクリックする。
   - 確認ダイアログが出たら **[公開]** をクリック。
5. ステータスが **`公開済み`** に変わったことを確認する。

> ⚠️ **この操作は元に戻せない。** 公開済みから開発中に戻すにはチャンネルを削除して再作成するしかない。本当に共有する準備ができてから実施すること。

> **「開発中」と「公開済み」の違い**: 開発中は管理者と招待されたテスターのみが LIFF アプリにログインできる。公開済みにすることで LINE ユーザー全員が LIFF アプリ（入力フォーム）を使えるようになる。

**友だち追加用 QR コードの共有:**

1. LINE Developers ＞ Messaging API チャンネル ＞ **[Messaging API 設定]** タブを開く。
2. **「ボットの基本情報」** セクションに QR コードが表示されている。
3. QR コードを右クリック（またはスクリーンショット）して画像を保存し、友だちに共有する。
   - LINE アプリの **[友だち追加]** ＞ **[QR コード]** で読み取ってもらえばボットが友だちに追加される。
4. 友だちが追加されたら、リッチメニューが表示されて各機能が使えることを確認してもらう。

> **注意**: 公開後もボットの LINE ID（`@〜`）やチャンネル名で検索されることはない。QR コードまたは友だち追加リンク（`https://lin.ee/〜`）を直接共有する形になる。友だち追加リンクは Messaging API 設定タブの QR コードの下に表示されている。

---

## 詰まったときは

各ステップで詰まった場合、以下を参照してください。

| 症状 | 確認先 |
|---|---|
| `sam build` が失敗する | Node.js 24.x がインストールされているか確認 |
| `sam deploy` が失敗する | `aws sso login` でセッションが生きているか確認 |
| LIFF フォームが開かない | ステップ6-1 の LIFF エンドポイント URL が正しいか確認 |
| Webhook 検証が失敗する | ステップ6-2 の URL が `WebhookUrl` の値と一致しているか確認 |
| GitHub Actions が動かない | `git push` したファイルが `paths` フィルターの対象か確認（`.md` ファイルのみの変更は動かない） |
| GitHub Actions が失敗する | GitHub リポジトリ ＞ Actions タブでログを確認 |

## さいごに

私自身は **Claude Code** を駆使して進めました。

私にはAWSの知見はありましたが、LINE APIやTypeScript、さらにはGitHub Actionsについても知識がほとんどありませんでした。それでも、AIをパートナーにすることで、最終的にシステムを完成させることができました。

改めてAIの進化を肌で感じるとともに、特に Claude Code の能力には目を見張るものがありました。皆さんも、ぜひ最新のAIツールと共に「自力で作り上げる体験」を楽しんでみてください。
