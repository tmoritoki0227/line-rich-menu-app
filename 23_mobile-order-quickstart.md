# 23. モバイルオーダー クイックスタート

> **このドキュメントの目的**
> リポジトリをクローンした後、モバイルオーダー機能をビルド・デプロイして動作確認するまでの手順です。
> 家計簿アプリ（07_quickstart.md）のデプロイが完了していることを前提とします。

---

## 前提条件

以下がすでに完了していること。

- AWS CLI・SAM CLI・Node.js・Git がインストール済み
- `aws configure` で認証情報が設定済み
- 家計簿アプリ（`line-rich-menu-app-stack-*`）が AWS にデプロイ済み

---

## 手順

### ステップ 1：リポジトリをクローン

```bash
git clone https://github.com/tmoritoki0227/line-rich-menu-app.git
cd line-rich-menu-app
```

---

### ステップ 2：フロントエンドの依存パッケージをインストール

vue-router が新たに追加されているためインストールが必要です。

```bash
cd frontend
npm install
cd ..
```

---

### ステップ 3：SAM ビルド＆デプロイ

バックエンド（Lambda）と新しい DynamoDB テーブル（`menu-items` / `orders`）を AWS に作成します。

```bash
sam build
sam deploy
```

デプロイ完了後、ターミナルに以下が表示されます。

```
CloudFormation outputs:
ApiUrl             = https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev
CloudFrontUrl      = https://xxxxxxxx.cloudfront.net
...
```

---

### ステップ 4：メニューデータを投入

DynamoDB の `menu-items` テーブルに初期メニューを登録します。
SAM deploy でテーブルが作成された後に実行してください。

> **メニュー画像について**
> 画像は Unsplash（無料写真サービス）の URL を直接指定しています。
> 本番運用する場合は自分の写真を S3 にアップロードして URL を差し替えてください。

```bash
cd backend
npx ts-node src/seed/menuSeed.ts
cd ..
```

成功すると以下のように表示されます。

```
テーブル: menu-items
8 件を投入します...
  ✅ アメリカーノ
  ✅ カフェラテ
  ✅ カプチーノ
  ✅ 抹茶ラテ
  ✅ オレンジジュース
  ✅ ミネラルウォーター
  ✅ クロワッサン
  ✅ チーズケーキ
完了！
```

---

### ステップ 5：フロントエンドをビルド＆デプロイ

GitHub に push すると CI/CD が自動でビルド・S3 アップロードを行います。

```bash
git add .
git commit -m "Add mobile order feature"
git push origin main
```

GitHub Actions の完了を確認したら次のステップへ進みます。

---

## 動作確認

CloudFront の URL（`https://xxxxxxxx.cloudfront.net`）を使って確認します。

---

### 確認① メニューが表示される（お客側）

ブラウザで以下を開く。

```
https://<CloudFrontドメイン>/order
```

**確認ポイント**

- コーヒー・ドリンク・フードのカテゴリタブが表示される
- 商品カードに名前・価格・「追加」ボタンが表示される

---

### 確認② カート → 注文 → 状況確認（お客側）

1. 商品の「追加」ボタンをタップ
   - オプションがある商品（アメリカーノなど）はサイズ・温度を選ぶモーダルが開く
2. 「カートを見る」ボタンが画面下に現れることを確認
3. カート画面で数量を変更できることを確認
4. 「注文確認へ進む」→「注文する」をタップ
5. 注文状況画面（⏳ ただいま準備中）が表示されることを確認

---

### 確認③ スタッフ画面で注文を受け取る

別タブで以下を開く。

```
https://<CloudFrontドメイン>/order/staff
```

**確認ポイント**

- 確認②で送った注文が一覧に表示される
- 「詳細・ステータス変更」をタップすると注文詳細が表示される
- 「準備完了にする」ボタンをタップする

---

### 確認④ お客画面がリアルタイムで更新される

確認②の注文状況画面（`/order/status/:orderId`）に戻り、5秒以内に以下に変わることを確認する。

```
✅ 準備ができました！
番号 xxx
カウンターまでお越しください
```

> **ポイント**：画面は5秒ごとに自動更新されます。手動リロードは不要です。

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `/order` を開くと家計簿が表示される | `AppShell.vue` が反映されていない | `npm run build` → `git push` をやり直す |
| メニューが表示されない（空白） | メニューデータが未投入 | ステップ 4 のシードを再実行する |
| 注文してもスタッフ画面に届かない | Lambda のデプロイが古い | `sam build && sam deploy` を再実行する |
| 注文状況が更新されない | ポーリングが止まっている | ページをリロードして再開する |
