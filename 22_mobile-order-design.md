# 22. モバイルオーダー機能 — 設計ドキュメント

> **このドキュメントの目的**
> 実装前の設計をまとめたものです。DynamoDB テーブル設計・API 設計・Vue 画面構成を定義します。
> 決済機能なし・スマホ画面・勉強用を前提とします。

---

## 1. 機能概要

LINE LIFF 内で動く「モバイルオーダーアプリ」です。
お客がスマホでメニューを選んで注文し、店員がスマホで注文を確認して完了にします。

### ユーザーフロー

```
お客（LINE ユーザー）                    店員（スタッフ）
        |                                    |
        | ① LIFFアプリを開く                   |
        |    メニュー一覧が表示される            |
        |                                    |
        | ② 商品を選ぶ                         |
        |    カートに追加                       |
        |                                    |
        | ③ 注文する                           |
        |    「注文する」ボタンを押す             |
        |                       ────────→   | ④ 注文が届く
        |                                    |    スタッフ画面に表示
        |                                    |    「準備完了」を押す
        |                       ←────────   |
        | ⑤ 通知を受け取る                     |
        |    「準備できました」画面に変わる        |
```

### 新しく学べること（調整さんとの違い）

| 概念 | 内容 |
|---|---|
| **2種類のユーザー** | お客側・スタッフ側で画面が異なる |
| **ポーリング** | 注文状態を一定間隔で自動更新する仕組み |
| **カート状態管理** | 複数商品を選んで合計を計算するロジック |
| **マスターデータ** | メニューという「変更が少ないデータ」の扱い方 |

---

## 2. 画面一覧

### お客側

| 画面 | パス | 説明 |
|---|---|---|
| メニュー一覧 | `/order` | カテゴリ別にメニューを表示 |
| カート | `/order/cart` | 選んだ商品・数量・合計金額 |
| 注文確認 | `/order/confirm` | 最終確認して「注文する」 |
| 注文状況 | `/order/status/:orderId` | 準備中 or 完了の表示（自動更新） |

### スタッフ側

| 画面 | パス | 説明 |
|---|---|---|
| 注文一覧 | `/order/staff` | 未完了の注文が届き順に並ぶ |
| 注文詳細 | `/order/staff/:orderId` | 商品内容確認・ステータス変更 |

---

## 3. DynamoDB テーブル設計

テーブルを2つ用意します。「メニュー」と「注文」は性質が異なるため分けます。

### テーブル①：menu-items（メニュー管理）

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `CATEGORY#<categoryId>` |
| `SK` | String | `ITEM#<itemId>` |
| `name` | String | 商品名（例：アメリカーノ） |
| `price` | Number | 価格（税込・円） |
| `description` | String | 商品説明 |
| `imageUrl` | String | 商品画像URL（S3）|
| `available` | Boolean | 売り切れ管理 |
| `options` | List | 選択肢（例：サイズ・温度） |

#### データ例

```json
{
  "PK": "CATEGORY#coffee",
  "SK": "ITEM#001",
  "name": "アメリカーノ",
  "price": 350,
  "description": "すっきりとした味わいのブラックコーヒー",
  "imageUrl": "https://xxxx.cloudfront.net/menu/americano.jpg",
  "available": true,
  "options": [
    {
      "label": "サイズ",
      "choices": ["S", "M", "L"],
      "extraPrice": [0, 50, 100]
    },
    {
      "label": "温度",
      "choices": ["ホット", "アイス"],
      "extraPrice": [0, 0]
    }
  ]
}
```

#### アクセスパターン

| 操作 | DynamoDB 操作 |
|---|---|
| 全メニュー取得 | `Scan`（データ量が少ないため許容） |
| カテゴリ別取得 | `Query`（PK = CATEGORY#coffee） |
| 売り切れ切り替え | `UpdateItem`（available を更新） |

---

### テーブル②：orders（注文管理）

| 属性名 | 型 | 説明 |
|---|---|---|
| `orderId` | String | PK（nanoid で生成） |
| `orderNumber` | Number | 人が読む番号（001, 002...） |
| `status` | String | `pending` / `ready` / `done` |
| `userId` | String | LINE の userId |
| `userName` | String | LINE の表示名 |
| `items` | List | 注文商品一覧（下記参照） |
| `totalPrice` | Number | 合計金額 |
| `createdAt` | String | 注文日時（ISO 8601） |

#### items の中身

```json
[
  {
    "itemId": "001",
    "name": "アメリカーノ",
    "price": 400,
    "quantity": 2,
    "selectedOptions": {
      "サイズ": "M",
      "温度": "アイス"
    }
  }
]
```

#### ステータスの流れ

```
pending（注文受付）→ ready（準備完了）→ done（受け取り済み）
```

#### GSI（グローバルセカンダリインデックス）

スタッフ画面で「未完了の注文一覧」を取得するために必要です。

| GSI名 | PK | SK |
|---|---|---|
| `status-createdAt-index` | `status` | `createdAt` |

これにより `status = "pending"` の注文を時間順に取得できます。

---

## 4. API 設計

### エンドポイント一覧

| メソッド | パス | 誰が使う | 説明 |
|---|---|---|---|
| `GET` | `/menu` | お客 | メニュー全件取得 |
| `POST` | `/order` | お客 | 注文を作成 |
| `GET` | `/order/{orderId}` | お客 | 注文状況を確認 |
| `GET` | `/staff/orders` | スタッフ | 未完了注文一覧 |
| `PUT` | `/staff/orders/{orderId}/status` | スタッフ | ステータス更新 |

---

### GET `/menu` — メニュー取得

**レスポンス 200**

```json
{
  "categories": [
    {
      "categoryId": "coffee",
      "label": "コーヒー",
      "items": [
        {
          "itemId": "001",
          "name": "アメリカーノ",
          "price": 350,
          "description": "すっきりとした味わい",
          "imageUrl": "https://...",
          "available": true,
          "options": [...]
        }
      ]
    },
    {
      "categoryId": "food",
      "label": "フード",
      "items": [...]
    }
  ]
}
```

---

### POST `/order` — 注文作成

**リクエスト**

```json
{
  "userId": "U1234567890abcdef",
  "userName": "田中",
  "items": [
    {
      "itemId": "001",
      "name": "アメリカーノ",
      "price": 400,
      "quantity": 2,
      "selectedOptions": {
        "サイズ": "M",
        "温度": "アイス"
      }
    }
  ],
  "totalPrice": 800
}
```

**レスポンス 201**

```json
{
  "orderId": "abc123",
  "orderNumber": 5
}
```

---

### GET `/order/{orderId}` — 注文状況確認

お客が一定間隔（5秒ごと）に叩いて状態を確認します（ポーリング）。

**レスポンス 200**

```json
{
  "orderId": "abc123",
  "orderNumber": 5,
  "status": "ready",
  "userName": "田中",
  "items": [...],
  "totalPrice": 800,
  "createdAt": "2025-04-01T12:00:00Z"
}
```

---

### GET `/staff/orders` — 未完了注文一覧

**レスポンス 200**

```json
{
  "orders": [
    {
      "orderId": "abc123",
      "orderNumber": 5,
      "status": "pending",
      "userName": "田中",
      "totalPrice": 800,
      "createdAt": "2025-04-01T12:00:00Z",
      "itemCount": 2
    }
  ]
}
```

---

### PUT `/staff/orders/{orderId}/status` — ステータス更新

**リクエスト**

```json
{
  "status": "ready"
}
```

**レスポンス 200**

```json
{
  "message": "updated"
}
```

---

## 5. フロントエンド 画面設計

### Vue Router 設定（追加分）

```ts
// お客側
{ path: '/order',                    component: () => import('../pages/order/MenuPage.vue') },
{ path: '/order/cart',               component: () => import('../pages/order/CartPage.vue') },
{ path: '/order/confirm',            component: () => import('../pages/order/ConfirmPage.vue') },
{ path: '/order/status/:orderId',    component: () => import('../pages/order/StatusPage.vue') },

// スタッフ側
{ path: '/order/staff',              component: () => import('../pages/order/staff/OrderListPage.vue') },
{ path: '/order/staff/:orderId',     component: () => import('../pages/order/staff/OrderDetailPage.vue') },
```

---

### フォルダ構成（追加分）

```
frontend/src/
├── pages/
│   └── order/
│       ├── MenuPage.vue          ← メニュー一覧
│       ├── CartPage.vue          ← カート
│       ├── ConfirmPage.vue       ← 注文確認
│       ├── StatusPage.vue        ← 注文状況（ポーリング）
│       └── staff/
│           ├── OrderListPage.vue  ← スタッフ：注文一覧
│           └── OrderDetailPage.vue← スタッフ：注文詳細
├── components/
│   └── order/
│       ├── MenuItemCard.vue      ← 商品カード（画像・名前・価格）
│       ├── CategoryTabs.vue      ← カテゴリ切り替えタブ
│       ├── OptionSelector.vue    ← サイズ・温度などの選択UI
│       ├── CartItem.vue          ← カート内の1商品行
│       └── OrderCard.vue         ← スタッフ画面の注文カード
└── composables/
    ├── useCart.ts                ← カートのロジック（追加・削除・合計）
    └── useOrder.ts               ← 注文送信・状態取得・ポーリング
```

---

### 画面①：MenuPage.vue（メニュー一覧）

```
┌───────────────────────────────┐
│  ☕ カフェオーダー               │
│                                │
│  [コーヒー] [フード] [ドリンク]   │  ← タブ
│  ─────────────────────────    │
│  ┌─────────┐  ┌─────────┐   │
│  │ 🖼 写真  │  │ 🖼 写真  │   │
│  │アメリカーノ│  │カフェラテ │   │
│  │  ¥350   │  │  ¥420   │   │
│  │ [追加]  │  │ [追加]  │   │
│  └─────────┘  └─────────┘   │
│  ┌─────────┐  ┌─────────┐   │
│  │ 🖼 写真  │  │ 🖼 写真  │   │
│  │カプチーノ │  │抹茶ラテ  │   │
│  │  ¥400   │  │  ¥450   │   │
│  │ [追加]  │  │ [追加]  │   │
│  └─────────┘  └─────────┘   │
│                                │
│  ┌────────────────────────┐   │
│  │ 🛒  カートを見る  2点 ¥750│   │  ← 固定フッター
│  └────────────────────────┘   │
└───────────────────────────────┘
```

---

### 画面②：CartPage.vue（カート）

```
┌───────────────────────────────┐
│  ← カートの中身                 │
│                                │
│  アメリカーノ（M・アイス）         │
│  ¥400          [-] 2 [+]      │
│  ─────────────────────────    │
│  カフェラテ（L・ホット）           │
│  ¥520          [-] 1 [+]      │
│  ─────────────────────────    │
│                                │
│  合計                 ¥1,320   │
│                                │
│  ┌────────────────────────┐   │
│  │      注文確認へ進む       │   │
│  └────────────────────────┘   │
└───────────────────────────────┘
```

---

### 画面③：ConfirmPage.vue（注文確認）

```
┌───────────────────────────────┐
│  注文内容の確認                  │
│                                │
│  アメリカーノ × 2      ¥800     │
│  カフェラテ × 1        ¥520     │
│  ─────────────────────────    │
│  合計                 ¥1,320   │
│                                │
│  ┌────────────────────────┐   │
│  │        注文する          │   │
│  └────────────────────────┘   │
└───────────────────────────────┘
```

---

### 画面④：StatusPage.vue（注文状況）

5秒ごとに自動でサーバーに問い合わせ（ポーリング）して画面を更新します。

```
【準備中の場合】
┌───────────────────────────────┐
│                                │
│        ⏳                      │
│   ただいま準備中です             │
│   番号： 5                     │
│                                │
│   アメリカーノ × 2              │
│   カフェラテ × 1                │
│                                │
│   しばらくお待ちください          │
│   （自動で更新されます）           │
└───────────────────────────────┘

【準備完了の場合】
┌───────────────────────────────┐
│                                │
│        ✅                      │
│   準備ができました！              │
│   番号： 5                     │
│                                │
│   カウンターまでお越しください      │
│                                │
└───────────────────────────────┘
```

---

### 画面⑤：OrderListPage.vue（スタッフ：注文一覧）

```
┌───────────────────────────────┐
│  📋 注文一覧                   │
│  （自動更新中 🔄）              │
│                                │
│  ┌────────────────────────┐   │
│  │ #5  田中さん   12:03    │   │
│  │ アメリカーノ×2 カフェラテ×1 │   │
│  │ ¥1,320         [詳細→] │   │
│  └────────────────────────┘   │
│  ┌────────────────────────┐   │
│  │ #6  鈴木さん   12:05    │   │
│  │ カプチーノ×1           │   │
│  │ ¥400           [詳細→] │   │
│  └────────────────────────┘   │
└───────────────────────────────┘
```

---

### 画面⑥：OrderDetailPage.vue（スタッフ：注文詳細）

```
┌───────────────────────────────┐
│  ← 注文 #5   田中さん           │
│                                │
│  アメリカーノ（M・アイス）× 2    │
│  カフェラテ（L・ホット）× 1      │
│  ─────────────────────────    │
│  合計  ¥1,320                  │
│  12:03 受付                    │
│                                │
│  ┌────────────────────────┐   │
│  │      準備完了にする       │   │  ← 押すと ready に変わる
│  └────────────────────────┘   │
│  ┌────────────────────────┐   │
│  │      受け取り済みにする   │   │  ← 押すと done に変わる
│  └────────────────────────┘   │
└───────────────────────────────┘
```

---

## 6. バックエンド ファイル構成（追加分）

```
backend/src/
├── handlers/
│   ├── menu.ts            ← GET /menu
│   └── order.ts           ← POST /order, GET /order/:id
│   └── staff.ts           ← GET /staff/orders, PUT /staff/orders/:id/status
├── services/
│   ├── menuService.ts     ← メニュー取得ロジック
│   └── orderService.ts    ← 注文作成・ステータス更新・集計ロジック
└── repositories/
    ├── menuRepository.ts  ← menu-items テーブル操作
    └── orderRepository.ts ← orders テーブル操作
```

---

## 7. template.yaml 変更点（概要）

### DynamoDB テーブル追加（2つ）

```yaml
MenuItemsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: menu-items
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - { AttributeName: PK, AttributeType: S }
      - { AttributeName: SK, AttributeType: S }
    KeySchema:
      - { AttributeName: PK, KeyType: HASH }
      - { AttributeName: SK, KeyType: RANGE }

OrdersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: orders
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - { AttributeName: orderId,   AttributeType: S }
      - { AttributeName: status,    AttributeType: S }
      - { AttributeName: createdAt, AttributeType: S }
    KeySchema:
      - { AttributeName: orderId, KeyType: HASH }
    GlobalSecondaryIndexes:
      - IndexName: status-createdAt-index
        KeySchema:
          - { AttributeName: status,    KeyType: HASH }
          - { AttributeName: createdAt, KeyType: RANGE }
        Projection:
          ProjectionType: ALL
```

### Lambda Events 追記

```yaml
GetMenu:
  Type: Api
  Properties:
    Path: /menu
    Method: get

CreateOrder:
  Type: Api
  Properties:
    Path: /order
    Method: post

GetOrder:
  Type: Api
  Properties:
    Path: /order/{orderId}
    Method: get

GetStaffOrders:
  Type: Api
  Properties:
    Path: /staff/orders
    Method: get

UpdateOrderStatus:
  Type: Api
  Properties:
    Path: /staff/orders/{orderId}/status
    Method: put
```

---

## 8. ポーリングの仕組み（重要）

注文状況画面（StatusPage.vue）は、サーバーに5秒ごとに問い合わせて状態を更新します。
WebSocket（リアルタイム通信）より実装が簡単で、学習コストが低いため採用します。

```ts
// useOrder.ts のイメージ
const startPolling = (orderId: string) => {
  const timer = setInterval(async () => {
    const result = await fetchOrderStatus(orderId)
    status.value = result.status

    // 完了したらポーリング停止
    if (result.status === 'ready' || result.status === 'done') {
      clearInterval(timer)
    }
  }, 5000) // 5秒ごと
}
```

---

## 9. スタッフ画面へのアクセス制御

勉強用のため、シンプルな URL 分離で対応します。
`/order/staff` の URL をスタッフだけに共有する運用です。

本番レベルにする場合は LINE の userId でスタッフ判定するか、Cognito で認証を追加します。

---

## 10. 未決事項（実装前に決める）

| 項目 | 選択肢 | 推奨 |
|---|---|---|
| 注文番号の採番 | DynamoDB カウンター / ランダム3桁 | DynamoDB カウンター（確実） |
| メニューデータの初期投入 | AWS コンソールから手動 / スクリプト | スクリプト（`seed.ts`）を作る |
| 商品画像 | S3 に置く / 外部URL | 勉強用なら外部URL（Unsplash等）で十分 |
| スタッフ画面の自動更新 | ポーリング（10秒）/ 手動リロード | ポーリング（10秒） |
| `done`（受け取り済み）の扱い | 一覧から非表示 / 別タブで表示 | 一覧から非表示（シンプル） |
