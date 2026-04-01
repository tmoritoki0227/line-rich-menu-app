# 21. 調整さん機能 — 設計ドキュメント

> **このドキュメントの目的**
> 実装前の設計をまとめたものです。DynamoDB テーブル設計・API 設計・Vue 画面構成を定義します。
> 実装手順は別ドキュメント（22_schedule-implementation.md）に記載予定です。

---

## 1. 機能概要

LINE LIFF 内で動く「日程調整ツール」です。調整さん（https://chouseisan.com）と同等の機能を目指します。

### ユーザーフロー

```
幹事（主催者）                    参加者
    |                               |
    | ① イベント作成                  |
    |   タイトル＋日程候補を入力        |
    |                               |
    | ② URLをシェア ──────────────→ |
    |                               | ③ URLを開く
    |                               |    回答ページ表示
    |                               |    名前 + ○△× を入力
    |                               |
    | ④ 結果確認 ←─────────────── |
    |   集計表を見て日程を決定          |
```

### 画面一覧

| 画面 | パス | 説明 |
|---|---|---|
| イベント作成 | `/schedule/create` | タイトル・日程候補を入力してイベントを作る |
| イベント閲覧 | `/schedule/:eventId` | 集計表の表示＋「出欠を入力する」ボタン |
| 出欠回答 | `/schedule/:eventId/answer` | 名前と○△×を入力して送信 |

---

## 2. DynamoDB テーブル設計

### テーブル名

`schedule-events`（`template.yaml` に新規追加）

### シングルテーブル設計

1つのテーブルで「イベント情報」と「回答情報」の両方を管理します。

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | パーティションキー |
| `SK` | String | ソートキー |
| その他 | — | アイテム種別ごとに異なる |

#### アイテム種別①：イベント情報

```
PK:         "EVENT#<eventId>"
SK:         "METADATA"
title:      "4月の勉強会"
dates:      ["2025-04-08T19:00", "2025-04-22T19:00", "2025-04-29T19:00"]
createdBy:  "<LINE userId>"   ← LIFF から取得（任意）
createdAt:  "2025-04-01T10:00:00Z"
```

#### アイテム種別②：参加者の回答

```
PK:         "EVENT#<eventId>"
SK:         "ANSWER#<answerId>"
name:       "田中"
responses:  {
              "2025-04-08T19:00": "○",
              "2025-04-22T19:00": "△",
              "2025-04-29T19:00": "×"
            }
comment:    "よろしくお願いします"   ← 任意
createdAt:  "2025-04-01T10:05:00Z"
```

### アクセスパターン

| 操作 | DynamoDB 操作 |
|---|---|
| イベント作成 | `PutItem` (PK=EVENT#xxx, SK=METADATA) |
| イベント取得 | `Query` (PK=EVENT#xxx) → METADATA + 全 ANSWER を一括取得 |
| 回答登録 | `PutItem` (PK=EVENT#xxx, SK=ANSWER#uuid) |
| 回答削除 | `DeleteItem` (PK=EVENT#xxx, SK=ANSWER#uuid) |

> **ポイント**：`Query` で PK を固定すると、METADATA と全 ANSWER が一度に取れます。
> GSI（グローバルセカンダリインデックス）は今回不要です。

---

## 3. API 設計

### エンドポイント一覧

既存の API Gateway に追加します。`template.yaml` に Events を追記するだけで完結します。

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/schedule` | イベント作成 |
| `GET` | `/schedule/{eventId}` | イベント取得（回答一覧含む） |
| `POST` | `/schedule/{eventId}/answer` | 出欠回答を登録 |
| `DELETE` | `/schedule/{eventId}/answer/{answerId}` | 回答を削除 |

---

### POST `/schedule` — イベント作成

**リクエスト**

```json
{
  "title": "4月の勉強会",
  "dates": [
    "2025-04-08T19:00",
    "2025-04-22T19:00",
    "2025-04-29T19:00"
  ],
  "createdBy": "U1234567890abcdef"
}
```

**レスポンス 201**

```json
{
  "eventId": "abc123xyz"
}
```

---

### GET `/schedule/{eventId}` — イベント取得

**レスポンス 200**

```json
{
  "event": {
    "eventId": "abc123xyz",
    "title": "4月の勉強会",
    "dates": ["2025-04-08T19:00", "2025-04-22T19:00", "2025-04-29T19:00"],
    "createdAt": "2025-04-01T10:00:00Z"
  },
  "answers": [
    {
      "answerId": "ans001",
      "name": "田中",
      "responses": {
        "2025-04-08T19:00": "○",
        "2025-04-22T19:00": "△",
        "2025-04-29T19:00": "×"
      },
      "comment": "よろしくお願いします"
    }
  ],
  "summary": {
    "2025-04-08T19:00": { "○": 3, "△": 1, "×": 0 },
    "2025-04-22T19:00": { "○": 2, "△": 2, "×": 0 },
    "2025-04-29T19:00": { "○": 1, "△": 0, "×": 3 }
  }
}
```

> `summary` はバックエンドで集計して返します。フロントで計算する必要はありません。

---

### POST `/schedule/{eventId}/answer` — 回答登録

**リクエスト**

```json
{
  "name": "鈴木",
  "responses": {
    "2025-04-08T19:00": "○",
    "2025-04-22T19:00": "○",
    "2025-04-29T19:00": "△"
  },
  "comment": ""
}
```

**レスポンス 201**

```json
{
  "answerId": "ans002"
}
```

---

### DELETE `/schedule/{eventId}/answer/{answerId}` — 回答削除

**レスポンス 200**

```json
{
  "message": "deleted"
}
```

---

## 4. フロントエンド 画面設計

### Vue Router 設定（追加分）

```ts
// router/index.ts に追加
{
  path: '/schedule/create',
  component: () => import('../pages/ScheduleCreate.vue')
},
{
  path: '/schedule/:eventId',
  component: () => import('../pages/ScheduleView.vue')
},
{
  path: '/schedule/:eventId/answer',
  component: () => import('../pages/ScheduleAnswer.vue')
}
```

---

### フォルダ構成（追加分）

```
frontend/src/
├── pages/                          ← 新規フォルダ
│   ├── ScheduleCreate.vue          ← イベント作成画面
│   ├── ScheduleView.vue            ← イベント閲覧・集計画面
│   └── ScheduleAnswer.vue          ← 出欠回答画面
├── composables/
│   └── useSchedule.ts              ← スケジュール機能のロジック（新規）
└── components/
    └── schedule/                   ← スケジュール用コンポーネント（新規）
        ├── DateTable.vue           ← 集計表
        └── ResponseRadio.vue       ← ○△× 選択ラジオボタン
```

---

### 画面①：ScheduleCreate.vue

```
┌─────────────────────────────────┐
│  日程調整を作る                    │
│                                  │
│  タイトル                          │
│  ┌──────────────────────────┐   │
│  │ 4月の勉強会               │   │
│  └──────────────────────────┘   │
│                                  │
│  日程候補                          │
│  ┌──────────────┐  ┌────────┐  │
│  │ 2025-04-08   │  │ 19:00  │  │
│  └──────────────┘  └────────┘  │
│  ┌──────────────┐  ┌────────┐  │
│  │ 2025-04-22   │  │ 19:00  │  │
│  └──────────────┘  └────────┘  │
│  + 日程を追加する                  │
│                                  │
│  ┌──────────────────────────┐   │
│  │      作成する              │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

**作成後の動作**：`/schedule/:eventId` に遷移し、シェア用 URL を表示

---

### 画面②：ScheduleView.vue（調整さんと同等）

```
┌─────────────────────────────────┐
│  4月の勉強会                      │
│  回答者 2名                       │
│                                  │
│  ┌───────┬──┬──┬──┐            │
│  │ 日程   │○ │△ │× │            │
│  ├───────┼──┼──┼──┤            │
│  │4/8水  │3 │1 │0 │            │
│  │4/22水 │2 │2 │0 │            │
│  │4/29水 │1 │0 │3 │            │
│  ├───────┼──┼──┼──┤            │
│  │コメント│  │  │  │            │
│  └───────┴──┴──┴──┘            │
│                                  │
│  ┌──────────────────────────┐   │
│  │    🟢  出欠を入力する      │   │
│  └──────────────────────────┘   │
│                                  │
│  📋 URLをコピー                   │
└─────────────────────────────────┘
```

---

### 画面③：ScheduleAnswer.vue

```
┌─────────────────────────────────┐
│  4月の勉強会                      │
│                                  │
│  お名前                           │
│  ┌──────────────────────────┐   │
│  │ 田中                     │   │
│  └──────────────────────────┘   │
│                                  │
│  ┌───────┬───┬───┬───┐         │
│  │ 日程   │ ○ │ △ │ × │         │
│  ├───────┼───┼───┼───┤         │
│  │4/8水  │ ● │   │   │         │
│  │4/22水 │   │ ● │   │         │
│  │4/29水 │   │   │ ● │         │
│  └───────┴───┴───┴───┘         │
│                                  │
│  コメント（任意）                   │
│  ┌──────────────────────────┐   │
│  │                          │   │
│  └──────────────────────────┘   │
│                                  │
│  ┌──────────────────────────┐   │
│  │      送信する              │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

---

## 5. バックエンド ファイル構成（追加分）

既存のレイヤードアーキテクチャ（handlers / services / repositories / clients）に沿って追加します。

```
backend/src/
├── handlers/
│   └── schedule.ts          ← HTTP リクエスト/レスポンスのみ担当（新規）
├── services/
│   └── scheduleService.ts   ← ビジネスロジック（集計など）（新規）
├── repositories/
│   └── scheduleRepository.ts ← DynamoDB 操作のみ（新規）
└── index.ts                 ← 新エンドポイントを追記
```

---

## 6. template.yaml 変更点（概要）

### DynamoDB テーブル追加

```yaml
ScheduleEventsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: schedule-events
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: PK
        AttributeType: S
      - AttributeName: SK
        AttributeType: S
    KeySchema:
      - AttributeName: PK
        KeyType: HASH
      - AttributeName: SK
        KeyType: RANGE
```

### Lambda Events 追記（既存 Function に追加）

```yaml
CreateSchedule:
  Type: Api
  Properties:
    Path: /schedule
    Method: post

GetSchedule:
  Type: Api
  Properties:
    Path: /schedule/{eventId}
    Method: get

CreateAnswer:
  Type: Api
  Properties:
    Path: /schedule/{eventId}/answer
    Method: post

DeleteAnswer:
  Type: Api
  Properties:
    Path: /schedule/{eventId}/answer/{answerId}
    Method: delete
```

---

## 7. 未決事項（実装前に決める）

| 項目 | 選択肢 | 推奨 |
|---|---|---|
| イベント ID の形式 | UUID v4 / nanoid（短縮ID） | nanoid（URLが短くなる） |
| 回答の編集 | 「名前＋削除して再投稿」で代用 / 編集機能を実装 | 削除＋再投稿で十分 |
| イベントの有効期限 | なし / DynamoDB TTL で自動削除 | TTL で 90 日後に削除 |
| 認証 | なし（URL知ってれば誰でも回答可） / LIFF ユーザー認証 | なし（調整さんと同様） |
| LIFF 設定 | 既存 LIFF チャネルに URL として追加 | 既存チャネルに `/schedule/create` を LIFF URL に設定 |
