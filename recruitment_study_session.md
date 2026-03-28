# AWS × LINE 家計簿ボット 勉強会のご案内

## 概要

LINEで動く家計簿ボットをゼロから作ります。
「動くものを作りながら学ぶ」をコンセプトに、実務で使われる技術を一通り体験できます。

## 勉強会を終えるとできること

- LINEのトーク画面から家計簿を記録・集計できるボットを自分で作れる
- AWSのサーバーレス構成（Lambda / DynamoDB / S3 / CloudFront）を一から構築できる
- TypeScript + Vue 3 でフロントエンドを作れる
- GitHubにpushするだけで自動デプロイされるCI/CD環境を構築できる
- LINEのリッチメニューやLIFFアプリを設定できる

## 使う技術

**フロントエンド**
TypeScript / Vue 3 / Vite / Tailwind CSS / LIFF SDK

**バックエンド**
AWS Lambda（Node.js）/ Amazon DynamoDB / API Gateway

**インフラ・配信**
Amazon S3 / Amazon CloudFront

**CI/CD・認証**
GitHub Actions / AWS IAM（OIDC認証）

## カリキュラム（全5回）

1. **AWS基盤の構築** — AWSアカウント設定・IAM・DynamoDBテーブル作成
2. **フロントエンド開発** — Vue 3 + LIFF でLINE連携フォームを作る
3. **バックエンド開発** — Lambda + API Gateway でAPIを実装する
4. **デプロイ・LINE連携** — S3・CloudFrontで公開、LINEリッチメニューを設定する
5. **CI/CD構築** — GitHub Actionsで自動デプロイパイプラインを作る

## 対象者

- プログラミングの基礎知識がある方（言語は問わない）
- AWSやLINE開発を実際に手を動かして学びたい方
- 「モダンな構成」を一度体験してみたい方

## 正直なところ

この構成は個人で小さいものを作るには少し手間がかかります。
ただ「こういう構成が実務で使われているんだな」という感覚をつかむには最適です。
CI/CDが整った瞬間に「楽になった」と感じられるのが、この勉強会のひとつの山場です。
