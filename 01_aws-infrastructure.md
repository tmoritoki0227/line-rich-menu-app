# 【記事①】AWS × LINE 家計簿ボットをTypeScriptで作る — AWS基盤 & 認証整備（IAM Identity Center）

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ IaC + CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。全4記事。
>
> - **記事①** AWS基盤 & 認証整備（本記事）
> - 記事② ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）
> - 記事③ バックエンド実装（Node.js Lambda / DynamoDB）
> - 記事④ IaC・CI/CD + LINE連携 & 最終検証

---

## ステップ1：AWS基盤 & 認証の整備（Identity Center / IAM）

### 背景・目的

従来はAWSのrootアカウントまたは固定のIAMユーザーのアクセスキーを使って操作していたが、これはセキュリティ上のリスクがある。
**IAM Identity Center（旧: AWS SSO）** を使うことで、以下のメリットが得られる。

- アクセスキーの発行が不要（一時的な認証情報を自動取得）
- 権限を役割ごとに分けて管理できる
- `aws sso login` コマンド1つで認証が完了する

> **前提**: AWS Organizationsは有効化済み、AWS CLI v2 インストール済み。

---

### 1-1. IAM Identity Center の有効化

1. AWSコンソールで「IAM Identity Center」を検索して開く。
2. **[有効にする]** ボタンをクリック。
   - リージョンは **東京（ap-northeast-1）** を選択する。ここで選んだリージョンが「ホームリージョン」となり、後から変更不可。日本で使う場合は東京で問題ない。
3. 「AWS Organizations と統合する」というメッセージが表示されたら **[続行]** をクリック。

---

### 1-2. 許可セット（Permission Sets）の作成

許可セットとは「このユーザーにどこまで操作を許すか」を定義したテンプレートのこと。
今回は2種類作成する。

#### AdministratorAccess（全権限）

1. Identity Center コンソール ＞ 左メニュー **[許可セット]** ＞ **[許可セットを作成]**。
2. **[事前定義された許可セット]** を選択。
3. リストから **`AdministratorAccess`** を選択して **[次へ]**。
4. セッション時間はデフォルト（1時間）のまま **[次へ]** ＞ **[作成]**。

#### PowerUserAccess（開発用：IAM操作制限あり）

1. 同様に **[許可セットを作成]** ＞ **[事前定義された許可セット]**。
2. リストから **`PowerUserAccess`** を選択して **[次へ]** ＞ **[作成]**。

> **使い分け**: 普段の開発作業は `PowerUserAccess` を使い、IAM操作が必要なときだけ `AdministratorAccess` に切り替える運用が望ましい。

---

### 1-3. ユーザーの作成とアカウントへの割り当て

> ⚠️ このセクションの操作はすべて **ルートユーザー** でAWSコンソールにログインして行う。

#### ユーザーの作成

1. Identity Center ＞ **[ユーザー]** ＞ **[ユーザーを追加]**。
   - ユーザー名: `moritoki-dev`
   - メールアドレス: Gmailのエイリアスを使用（例: `tmoritoki0227+aws-dev@gmail.com`）
2. グループへの追加（ステップ2）は **スキップ** して **[次へ]**。
3. 内容を確認して **[ユーザーを追加]** をクリック。
   - ここで初めて招待メールが送信される。
4. 届いたメールのリンクからパスワード設定・MFA設定を完了させる。

#### アカウントへの割り当て（権限付与）

> この手順が完了するまで、作成したユーザーでログインしてもAWSアクセスポータルは空白になる。

1. Identity Center ＞ 左メニュー **[AWSアカウント]** をクリック。
2. 対象のアカウントにチェックを入れ ＞ **[ユーザーまたはグループを割り当て]** をクリック。
3. 作成したユーザーを検索して選択 ＞ **[次へ]**。
4. `AdministratorAccess` にチェックを入れ ＞ **[次へ]** ＞ **[送信]**。
5. AWSアクセスポータルに作成したユーザーでログインし直すと、AWSアカウントのボタンが表示される。

> **なぜ `AdministratorAccess` を使うか**: このシリーズでは Lambda・DynamoDB・API Gateway・CloudFront・S3・IAMロールなど多くのAWSリソースを作成する。`PowerUserAccess` はIAMの一部操作が制限されており、Lambda実行ロールの作成などができないためリソース作成が途中で失敗することがある。学習用途では `AdministratorAccess` で進めるのが確実。

---

### 1-4. AWS CLI v2 の SSO 連携設定

ターミナルで以下を実行して、SSOプロファイルを設定する。

```bash
aws configure sso
```

対話形式で以下を入力する。

```
SSO session name (Recommended): my-sso
SSO start URL [None]: https://d-9567b7a35a.awsapps.com/start
SSO region [None]: ap-northeast-1
SSO registration scopes [sso:account:access]: (そのままEnter)
```

ブラウザが自動で開くので、Identity Center にログインして認証を完了させる。
その後、CLIに戻って以下を入力する。

```
CLI default client Region [None]: ap-northeast-1
CLI default output format [None]: json
CLI profile name [AdministratorAccess-XXXXXXXXXXXX]: line-rich-menu-app
```

> `line-rich-menu-app` がプロファイル名になる。`~/.aws/config` に設定が保存される。

---

### 1-5. ログイン確認

```bash
# SSOログイン（ブラウザが開く）
aws sso login --profile line-rich-menu-app

# 認証情報の確認
aws sts get-caller-identity --profile line-rich-menu-app
```

以下のようにアカウントIDとユーザー情報が表示されれば成功。

```json
{
    "UserId": "AROA...:ユーザー名",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess_.../ユーザー名"
}
```

> **ポイント**: `assumed-role` と表示されているのがIdentity Centerによる一時認証の証拠。アクセスキーが発行されていないため、キーの流出リスクがない。

---

### 1-6. プロファイルを省略するための設定（任意）

毎回 `--profile` を付けるのが手間な場合は、環境変数で固定できる。

```bash
export AWS_PROFILE=line-rich-menu-app
# 確認
aws sts get-caller-identity
```

---
