# 【記事③】AWS × LINE 家計簿ボットをTypeScriptで作る — バックエンド実装（Lambda / DynamoDB / API Gateway）

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ IaC + CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。全4記事。
>
> - 記事① AWS基盤 & 認証整備（IAM Identity Center）
> - 記事② ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）
> - **記事③** バックエンド実装（本記事）
> - 記事④ IaC・CI/CD + LINE連携 & 最終検証

---

## ステップ6：DynamoDB テーブルの作成

DynamoDB はデータを保存するデータベース。「テーブル」という単位でデータを管理する。

> **AWSコンソールへのアクセスについて**: 記事①でIAM Identity Centerを設定した場合は、`https://your-sso-domain.awsapps.com/start` のアクセスポータルから対象アカウントを選択してコンソールに入る（直接 `console.aws.amazon.com` を開いてもログインできない）。以降「AWSコンソール」と書いてある箇所はすべてSSO経由で入った後のコンソールを指す。

### 6-1. テーブルの作成（AWSコンソール）

1. アクセスポータルから AWSコンソールにログインし、リージョンを **東京（ap-northeast-1）** に切り替える。
2. 検索バーで **DynamoDB** と入力して開く。
3. 左メニュー **[テーブル]** ＞ **[テーブルの作成]** をクリック。
4. 以下の内容を入力する。

| 項目 | 値 |
|---|---|
| テーブル名 | `line-bot-table-v3` |
| パーティションキー | `userId`（文字列） |
| ソートキー | `id`（文字列） |

> **キーの役割**: パーティションキー（`userId`）でデータの保存先が決まり、ソートキー（`id`）でユーザーごとの複数レコードを識別する。ユーザーの履歴を一括取得するときに効率よく動く設計。

5. **「テーブル設定」** は **[デフォルト設定]** のままにする。

> **デフォルト設定について**: 「オンデマンドキャパシティ」が選択される。アクセス量に応じて自動でスケールするため、個人開発には最適。

6. 一番下の **[テーブルの作成]** をクリック。ステータスが「アクティブ」になれば完了。

---

## ステップ7：backend/ の初期化

### 7-1. フォルダ構成の確認

ターミナルで `backend/` フォルダに移動する。

```bash
# line-rich-menu-app フォルダ内で実行
cd backend
```

完成時のフォルダ構成は以下になる。

```
backend/
├── src/
│   ├── index.ts        ← Lambda のメインハンドラ（ルーティング）
│   ├── transaction.ts  ← 家計簿の保存・取得・集計ロジック
│   └── webhook.ts      ← LINE Webhook の受信・返信ロジック
├── dist/               ← ビルド出力（自動生成）
├── package.json
└── tsconfig.json
```

### 7-2. package.json の作成

```bash
npm init -y
```

生成された `package.json` の `scripts` を以下に書き換える。

```json
{
  "name": "backend",
  "version": "1.0.0",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js --external:@aws-sdk/*",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

> **`--external:@aws-sdk/*` について**: AWS Lambda の Node.js 22 実行環境には AWS SDK v3 があらかじめ含まれている。そのためバンドルから除外することで ZIP ファイルのサイズを大幅に削減できる。

### 7-3. ライブラリのインストール

```bash
# AWS SDK v3（DynamoDB 操作）
# @aws-sdk/* は Lambda 実行環境に含まれているため devDependencies でOK
npm install -D @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# TypeScript 関連
npm install -D typescript @types/node @types/aws-lambda

# バンドルツール（TypeScript → 単一 JS ファイル）
npm install -D esbuild
```

> **`@types/aws-lambda` について**: Lambda ハンドラ関数の引数・戻り値に型を付けるための型定義パッケージ。コードを書くときの補完やエラー検出に役立つ。

### 7-4. tsconfig.json の作成

`backend/` フォルダに `tsconfig.json` を作成する。

```json
{
  "compilerOptions": {
    "target": "ES2022",       // Node.js 22 が対応している JavaScript のバージョン
    "module": "commonjs",     // Lambda（Node.js）が読み込める形式
    "lib": ["ES2022"],
    "outDir": "./dist",       // コンパイル後のファイル出力先
    "rootDir": "./src",       // TypeScript ソースのルートフォルダ
    "strict": true,           // 厳密な型チェックを有効にする
    "esModuleInterop": true,  // import 文の互換性を上げる
    "skipLibCheck": true      // 外部ライブラリの型チェックをスキップ（ビルド高速化）
  },
  "include": ["src/**/*"]
}
```

---

## ステップ8：Lambda 関数のコーディング

### 8-1. src/index.ts（メインハンドラ）

`src/` フォルダを作成し、`src/index.ts` を作成する。

```bash
mkdir src
```

`src/index.ts`:

```typescript
// Lambda のエントリポイント
// API Gateway からのリクエストをパスとメソッドで各処理関数に振り分ける

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
// APIGatewayProxyEvent : API Gateway から Lambda に渡されるリクエスト情報の型
// APIGatewayProxyResult: Lambda が API Gateway に返すレスポンスの型

import { saveTransaction, getHistory, getSummary } from './transaction'
import { handleWebhook } from './webhook'

// Lambda ハンドラ
// Lambda 関数が呼び出されると、この handler 関数が実行される
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // デバッグ用ログ（CloudWatch Logs で確認できる）
  console.log('Request:', event.httpMethod, event.path)

  const method = event.httpMethod // "GET" / "POST" など
  const path = event.path         // "/transaction" / "/history" など

  try {
    // パスとメソッドの組み合わせで処理を振り分ける

    if (method === 'POST' && path === '/transaction') {
      // LIFF フォームからの家計簿データ保存（DynamoDB）
      return await saveTransaction(event)
    }

    if (method === 'GET' && path === '/history') {
      // 家計簿の履歴取得（最新20件）
      return await getHistory(event)
    }

    if (method === 'GET' && path === '/summary') {
      // 指定期間の支出合計を集計
      return await getSummary(event)
    }

    if (method === 'POST' && path === '/webhook') {
      // LINE サーバーからの Webhook 受信
      return await handleWebhook(event)
    }

    // 上記以外のパスは 404 を返す
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Not Found' }),
    }
  } catch (err) {
    // 予期しないエラーが起きた場合は 500 を返す
    console.error('Unhandled error:', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Internal Server Error' }),
    }
  }
}
```

### 8-2. src/transaction.ts（保存・取得・集計）

`src/transaction.ts` を作成する。

```typescript
// 家計簿データの保存（POST /transaction）・取得（GET /history）・集計（GET /summary）を担当する

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient, // DynamoDB の操作を簡略化するラッパー
  PutCommand,             // レコードを1件書き込むコマンド
  QueryCommand,           // パーティションキーで検索するコマンド
} from '@aws-sdk/lib-dynamodb'

// DynamoDB クライアントの初期化
// Lambda 実行環境では IAM ロールの権限が自動的に使われる（認証情報を直接書く必要はない）
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
})
// DynamoDBDocumentClient を使うと型変換（DynamoDB形式 ↔ JS形式）が自動で行われる
const docClient = DynamoDBDocumentClient.from(dynamoClient)

// テーブル名は環境変数から取得する（ハードコードを避ける）
const TABLE_NAME = process.env.TABLE_NAME ?? 'line-bot-table-v3'

// CORS ヘッダー
// ブラウザ（LIFF）から API Gateway を呼び出す際に必要
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // すべてのオリジンからのアクセスを許可
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * 家計簿データを DynamoDB に保存する
 * POST /transaction
 *
 * リクエストボディ:
 * {
 *   userId: string   // LINE ユーザーID
 *   groupId?: string // グループトークのID（任意）
 *   date: string     // 日付（例: "2024-03-28"）
 *   amount: number   // 金額
 *   item: string     // 品物名
 * }
 */
export async function saveTransaction(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // リクエストボディを JSON としてパース
  const body = JSON.parse(event.body ?? '{}')
  const { userId, groupId, date, amount, item } = body

  // 必須パラメータのバリデーション
  if (!userId || !date || !amount || !item) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId, date, amount, item は必須です' }),
    }
  }

  // Node.js 15+ で使える組み込みの UUID 生成（外部パッケージ不要）
  const id = crypto.randomUUID()

  // DynamoDB にレコードを書き込む
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        userId,                             // パーティションキー（必須）
        id,                                 // ソートキー（必須）
        date,
        amount: Number(amount),             // 文字列で来た場合に備えて数値に変換
        item,
        groupId: groupId ?? null,           // 未指定の場合は null
        createdAt: new Date().toISOString(), // 作成日時（管理用）
      },
    })
  )

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ message: '保存しました', id }),
  }
}

/**
 * 指定ユーザーの家計簿履歴を取得する
 * GET /history?userId=xxx
 */
export async function getHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // クエリパラメータから userId を取得
  const userId = event.queryStringParameters?.userId

  if (!userId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId は必須です' }),
    }
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      // KeyConditionExpression: 検索条件を指定する
      // ここでは PK（userId）が一致するレコードをすべて取得する
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId, // :userId という変数に実際の値を代入する
      },
      ScanIndexForward: false, // false にすると新しい順（SK の降順）で取得
      Limit: 20,               // 最大20件に絞る
    })
  )

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Items ?? []), // アイテムがない場合は空配列を返す
  }
}

/**
 * 指定ユーザーの指定期間の支出合計を集計する
 * GET /summary?userId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * DynamoDB には日付専用のインデックスがないため、全件取得後にアプリ側でフィルタする。
 * データ量が膨大になった場合は GSI（グローバルセカンダリインデックス）の追加を検討すること。
 */
export async function getSummary(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const { userId, startDate, endDate } = event.queryStringParameters ?? {}

  // 必須パラメータのバリデーション
  if (!userId || !startDate || !endDate) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId, startDate, endDate は必須です' }),
    }
  }

  // 指定ユーザーの全レコードを取得する
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  )

  // 文字列比較で日付範囲フィルタ（"YYYY-MM-DD" 形式は辞書順 = 日付順）
  // 例: "2024-03-01" >= "2024-03-01" && "2024-03-01" <= "2024-03-31" → true
  const total = (result.Items ?? [])
    .filter(record => {
      const d = String(record.date)
      return d >= startDate && d <= endDate
    })
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ total }),
  }
}
```

### 8-4. src/webhook.ts（LINE Webhook）

`src/webhook.ts` を作成する。対応キーワードは「合計」「最新の履歴を表示」の2種類。

```typescript
// LINE から送られてくる Webhook イベントを受信・処理する

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import * as crypto from 'crypto' // 署名検証に使う Node.js 組み込みモジュール
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const TABLE_NAME = process.env.TABLE_NAME ?? 'line-bot-table-v3'

// LINE Webhook イベントの型定義（必要最低限）
interface LineWebhookBody {
  events: LineEvent[]
}
interface LineEvent {
  type: string
  replyToken: string
  source: {
    userId?: string
    groupId?: string
    type: string
  }
  message?: {
    type: string
    text?: string
  }
}

// 履歴1件の型（表示用）
interface HistoryItem {
  date: string
  time: string      // HH:MM（JST）
  item: string
  amount: number
  createdAt: string // ISO 文字列（ソート用）
}

/**
 * LINE Webhook の署名を検証する
 *
 * LINE はリクエストの正当性を証明するために、
 * チャネルシークレットを使って署名（HMAC-SHA256）を計算してヘッダーに付ける。
 * この署名を検証することで、LINE サーバー以外からの不正なリクエストを弾ける。
 */
function verifyLineSignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET ?? ''
  // HMAC-SHA256 でハッシュ値を計算して Base64 エンコード
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64')
  return hash === signature
}

/**
 * LINE にリプライメッセージを送る
 *
 * LINE Reply API を直接呼び出す（Node.js 18 組み込みの fetch を使用）
 */
async function replyToLine(replyToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // LINE チャネルアクセストークンを Bearer トークンとして渡す
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

/**
 * LINE に Flex Message（カード形式）でリプライを送る
 *
 * ボタンをタップすると text アクションでメッセージを送信できる
 */
async function replyFlexToLine(
  replyToken: string,
  altText: string,
  contents: object
): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'flex', altText, contents }],
    }),
  })
}


/**
 * 指定ユーザーの当月合計金額を DynamoDB から集計する
 */
async function getMonthlyTotal(userId: string): Promise<number> {
  const now = new Date()
  // 当月の "YYYY-MM" 形式（例: "2024-03"）
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // ユーザーの全レコードを取得
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  )

  // 取得したレコードの中から当月のものだけ抽出して合計する
  return (result.Items ?? [])
    .filter(item => String(item.date).startsWith(yearMonth))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
}

/**
 * 指定ユーザーの最新 n 件の履歴を DynamoDB から取得する
 * 「最新の履歴を表示」キーワード用
 */
async function getRecentHistory(userId: string, limit = 5): Promise<HistoryItem[]> {
  // SK が UUID（ランダム）のため DynamoDB のソート順は日付順にならない
  // 全件取得してアプリ側で登録日時降順にソートし、上位 limit 件を返す
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    })
  )
  return (result.Items ?? [])
    .map(record => {
      const createdAt = String(record.createdAt ?? '')
      // createdAt（UTC）を JST（+9h）に変換して "HH:MM" を取り出す
      const jstTime = createdAt
        ? new Date(new Date(createdAt).getTime() + 9 * 60 * 60 * 1000)
            .toISOString()
            .substring(11, 16) // "HH:MM"
        : '--:--'
      return {
        date: String(record.date),
        time: jstTime,
        item: String(record.item),
        amount: Number(record.amount),
        createdAt,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // 登録日時の新しい順
    .slice(0, limit)
}

/**
 * LINE Webhook を受信して処理する
 * POST /webhook
 */
export async function handleWebhook(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const body = event.body ?? ''
  const signature = event.headers['x-line-signature'] ?? ''

  // 署名検証（不正なリクエストを弾く）
  if (!verifyLineSignature(body, signature)) {
    console.warn('Invalid LINE signature')
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const { events }: LineWebhookBody = JSON.parse(body)

  // 複数のイベントを並列処理する
  // Promise.all で一括実行することで処理時間を短縮できる
  await Promise.all(events.map(lineEvent => processLineEvent(lineEvent)))

  // LINE サーバーには必ず 200 を返す
  // 200 以外を返したり応答が遅れると、LINE がリトライを繰り返してしまう
  return { statusCode: 200, body: 'OK' }
}

/**
 * LINE イベントの種類に応じて処理を分岐する
 *
 * 対応キーワード:
 * - 「合計」「summary」  : 当月の支出合計を返す
 * - 「最新の履歴を表示」 : 最新5件の履歴を返す
 * - 「ヘルプ」           : 操作メニューを Flex Message で返す
 * - 「機能2」            : 準備中メッセージを返す
 * - その他              : 使い方の案内を返す
 */
async function processLineEvent(event: LineEvent): Promise<void> {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message?.type !== 'text') return

  const text = (event.message.text ?? '').trim()

  // LIFF アプリからの通知メッセージは無視する（liff.sendMessages() で送られる）
  // これらはユーザーへの記録通知であり、Webhook のキーワード処理対象外
  if (text.startsWith('💰 家計簿記録完了！')) return

  const userId = event.source.userId ?? ''
  const replyToken = event.replyToken

  if (text === '合計' || text === 'summary') {
    // 「合計」と送ると当月の支出合計を返す
    const total = await getMonthlyTotal(userId)
    const now = new Date()
    const yearMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`
    await replyToLine(replyToken, `📊 ${yearMonth}の合計: ${total.toLocaleString()}円`)

  } else if (text === '最新の履歴を表示') {
    // 最新5件の履歴を取得して返す
    const items = await getRecentHistory(userId, 5)
    if (items.length === 0) {
      await replyToLine(replyToken, '📋 まだ記録がありません。\nLIFF フォームから入力してください。')
    } else {
      // 各行を "日付 時間 品物 金額円" 形式でフォーマット
      const lines = items.map(i => `${i.date} ${i.time}  ${i.item}  ${i.amount.toLocaleString()}円`)
      const message = `📋 最新${items.length}件の履歴:\n${lines.join('\n')}`
      await replyToLine(replyToken, message)
    }

  } else if (text === 'ヘルプ') {
    // 操作メニューを Flex Message（カード形式）で返す
    // ボタンをタップするとそのキーワードがチャットに送信される
    const flexContents = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '操作メニュー',
            weight: 'bold',
            size: 'lg',
            margin: 'md',
          },
          {
            type: 'text',
            text: '以下から操作を選んでください',
            size: 'sm',
            color: '#888888',
            margin: 'sm',
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#4CAF50',
                action: {
                  type: 'message',
                  label: '📊 今月の合計を見る',
                  text: '合計',
                },
              },
              {
                type: 'button',
                style: 'primary',
                color: '#2196F3',
                action: {
                  type: 'message',
                  label: '📋 最新の履歴を見る',
                  text: '最新の履歴を表示',
                },
              },
              {
                type: 'button',
                style: 'secondary',
                action: {
                  type: 'message',
                  label: '❓ ヘルプを表示',
                  text: 'ヘルプ',
                },
              },
            ],
          },
        ],
      },
    }
    await replyFlexToLine(replyToken, '操作メニュー', flexContents)

  } else if (text === '機能2') {
    // 未実装機能のプレースホルダー
    await replyToLine(replyToken, '🚧 この機能は現在準備中です。\nしばらくお待ちください。')

  } else {
    // 上記以外は使い方の案内を返す
    await replyToLine(
      replyToken,
      '「合計」→ 今月の合計\n「最新の履歴を表示」→ 最新履歴\n「ヘルプ」→ 操作メニュー\n\n入力はリッチメニューの「入力フォーム」から行ってください。'
    )
  }
}```

---

## ステップ9：ビルドと ZIP 化

### 9-1. ビルドの実行

`backend/` フォルダで以下を実行する。

```bash
npm run build
```

成功すると `dist/index.js` が生成される。

> **esbuild が何をしているか**: TypeScript は Node.js がそのまま実行できないため、通常は `tsc` コマンドで JavaScript に変換（コンパイル）する必要がある。さらに今回のように複数ファイル（`index.ts` / `transaction.ts` / `webhook.ts`）に分かれているコードを Lambda にアップロードするには、1つのファイルにまとめる（バンドル）作業も必要になる。`esbuild` はこの「TypeScript → JavaScript への変換」と「複数ファイルの1つにまとめる」を同時に高速でやってくれるツール。

```
backend/
└── dist/
    └── index.js  ← ✅ この1ファイルを Lambda にアップロードする
```

### 9-2. ZIP ファイルの作成

`dist/index.js` を ZIP に圧縮する。

**Windows（PowerShell）の場合:**

```powershell
Compress-Archive -Path dist\index.js -DestinationPath function.zip -Force
```

**Mac / Linux の場合:**

```bash
cd dist && zip ../function.zip index.js && cd ..
```

> **注意**: ZIP のルートに `index.js` が直接入っていること（`dist/` フォルダごと圧縮しないこと）。Lambda は ZIP 展開後に `index.js` を探すため、フォルダが余分に挟まると動かない。

---

## ステップ10：Lambda のセットアップ（AWSコンソール）

### 10-1. Lambda 関数の作成

1. AWSコンソール ＞ **Lambda** ＞ **[関数の作成]** をクリック。
2. **[一から作成]** を選択し、以下を入力する。

| 項目 | 値 |
|---|---|
| 関数名 | `line-bot-table-v3-handler` |
| ランタイム | **Node.js 22.x** |
| アーキテクチャ | x86_64 |

3. **[関数の作成]** をクリック。

### 10-2. ZIP のアップロード

**CLI で行う場合（推奨）:**

`backend/` フォルダで以下を実行する。

```bash
aws lambda update-function-code \
  --function-name line-bot-table-v3-handler \
  --zip-file fileb://function.zip
```

**コンソールで行う場合:**

1. 作成した関数のページ ＞ **[コード]** タブ。
2. **[アップロード元]** ＞ **[.zip ファイル]** を選択。
3. 先ほど作成した `function.zip`（`backend/` フォルダ直下にある）をアップロードする。
4. **[保存]** をクリック。

> アップロード後、コードエディタに `index.js` の中身が表示されれば成功。

### 10-3. ハンドラの確認

**[コード]** タブ ＞ 画面を下にスクロール ＞ **[ランタイム設定]** ＞ **[編集]** で、ハンドラが `index.handler` になっていることを確認する。

> `index.handler` は「`index.js` の中にある `handler` という名前の export を呼び出す」という意味。

### 10-4. 環境変数の設定

**[設定]** タブ ＞ **[環境変数]** ＞ **[編集]** ＞ **[環境変数の追加]** で以下を追加する。

| キー | 値 |
|---|---|
| `TABLE_NAME` | `line-bot-table-v3` |
| `LINE_CHANNEL_ACCESS_TOKEN` | 記事②で取得したチャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | 記事②で取得したチャネルシークレット |

> **なぜ環境変数で管理するか**: 秘匿情報（トークン等）をコードに直接書くと Git に混入するリスクがある。環境変数として外出しにしておくと、コードを公開しても安全。


### 10-5. IAM ロールに DynamoDB 権限を追加

Lambda が DynamoDB にアクセスするには、Lambda の実行ロールに権限が必要。

1. **[設定]** タブ ＞ **[アクセス権限]** ＞ ロール名のリンク（`line-bot-table-v3-handler-role-xxxx`）をクリック。
2. IAM コンソールが開く ＞ **[許可を追加]** ＞ **[ポリシーをアタッチ]** をクリック。
3. 検索ボックスで `AmazonDynamoDBFullAccess` を検索してチェック ＞ **[許可を追加]** をクリック。

> **本番運用では**: `AmazonDynamoDBFullAccess` はすべての DynamoDB 操作を許可する広い権限。本番では対象テーブルのみに絞ったカスタムポリシーが推奨。今回は学習目的のため Full Access を使う。

### 10-6. タイムアウトの延長

初期値の3秒では DynamoDB のコールドスタート時にタイムアウトすることがある。

1. **[設定]** タブ ＞ **[一般設定]** ＞ **[編集]**。
2. タイムアウトを **15秒** に変更 ＞ **[保存]**。

> **タイムアウト値の考え方**: Lambda のコールドスタート（しばらく使われていなかった関数の初回起動）には数秒かかることがある。DynamoDB へのアクセスも含めると初回は5〜10秒程度になる場合がある。15秒あれば余裕をもって完了できる。30秒は安全すぎるため15秒に設定している。本番運用では実際の処理時間を計測して最適値に調整する。

---

## ステップ11：API Gateway の設定

### 11-1. REST API の作成

1. AWSコンソール ＞ **API Gateway** 　＞ **[APIを作成]** をクリック。
2. **REST API**　の **[構築]** をクリック。
3. 以下を入力して **[APIを作成]** をクリック。

| 項目 | 値 |
|---|---|
| API名 | `line-bot-api-v3` |
| APIエンドポイントタイプ | リージョン |

### 11-2. リソースとメソッドの作成

以下の4つのエンドポイントを順番に作成する。

| リソース | メソッド | 用途 | CORS |
|---|---|---|---|
| `/transaction` | POST | 家計簿データの保存 | 必要 |
| `/history` | GET | 履歴の取得 | 必要 |
| `/summary` | GET | 期間集計 | 必要 |
| `/webhook` | POST | LINE Webhook の受信 | 不要 |

> **CORS が必要な理由**: CORS（クロスオリジンリソースシェアリング）とは、異なるドメイン間の通信をブラウザが制限する仕組みのこと。LIFF アプリは CloudFront（例: `https://xxx.cloudfront.net`）から配信されるが、API は `https://xxx.execute-api.ap-northeast-1.amazonaws.com` という別ドメインにある。ブラウザはデフォルトで別ドメインへのアクセスをブロックするため、API Gateway 側で「このドメインからのアクセスを許可する」という設定（CORS）が必要になる。`/webhook` は LINE のサーバーが直接呼び出す（ブラウザ経由でない）ため CORS は不要。

**`/transaction`（POST）の作成:**

1. **[リソースを作成]** ＞ リソース名: `transaction`（パスが `/transaction` になる）＞ **[リソースを作成]**。
2. 作成した `/transaction` リソースを選択 ＞ **[メソッドを作成]**。
3. メソッドタイプ: `POST` / 統合タイプ: `Lambda 関数` / **Lambdaプロキシ統合: ON** / Lambda 関数: 作成した関数名 ＞ **[メソッドを作成]**。
4. `/transaction` リソースを選択 ＞ **[CORS を有効にする]** ＞ デフォルトのまま **[保存]**。

> **⚠️ Lambdaプロキシ統合は必ず ON にすること**: OFF のままだと API Gateway が Lambda の戻り値を解釈せず、Lambda が返した `{"statusCode":404,"body":"..."}` というオブジェクト全体がそのままレスポンスボディになってしまう。HTTP ステータスは常に 200 になり、意図した動作にならない。

**`/history`（GET）の作成:**

1. **[リソースを作成]** ＞ リソース名: `history` ＞ **[リソースを作成]**。
2. `/history` リソースを選択 ＞ **[メソッドを作成]**。
3. メソッドタイプ: `GET` / 統合タイプ: `Lambda 関数` / **Lambdaプロキシ統合: ON** / Lambda 関数: 作成した関数名 ＞ **[メソッドを作成]**。
4. `/history` リソースを選択 ＞ **[CORS を有効にする]** ＞ **[保存]**。

**`/summary`（GET）の作成:**

1. **[リソースを作成]** ＞ リソース名: `summary` ＞ **[リソースを作成]**。
2. `/summary` リソースを選択 ＞ **[メソッドを作成]**。
3. メソッドタイプ: `GET` / 統合タイプ: `Lambda 関数` / **Lambdaプロキシ統合: ON** / Lambda 関数: 作成した関数名 ＞ **[メソッドを作成]**。
4. `/summary` リソースを選択 ＞ **[CORS を有効にする]** ＞ **[保存]**。

**`/webhook`（POST）の作成:**

1. **[リソースを作成]** ＞ リソース名: `webhook` ＞ **[リソースを作成]**。
2. `/webhook` リソースを選択 ＞ **[メソッドを作成]**。
3. メソッドタイプ: `POST` / 統合タイプ: `Lambda 関数` / **Lambdaプロキシ統合: ON** / Lambda 関数: 作成した関数名 ＞ **[メソッドを作成]**。
4. CORS 設定は不要（LINE サーバーはブラウザ経由でなく直接呼び出すため）。

### 11-3. API のデプロイ

1. **[APIをデプロイ]** をクリック。
2. ステージ: **[新しいステージ]** ＞ ステージ名: `dev` ＞ **[デプロイ]** をクリック。
3. 表示された **「ステージの呼び出し URL」** をコピーして保存する。

```
例: https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev
```

---

## ステップ12：動作確認

> **⚠️ `{"statusCode":404,...}` という形でレスポンスが返ってきた場合**: Lambdaプロキシ統合が OFF になっている。API Gateway コンソールで各メソッド（POST /transaction など）を選択 ＞ **[統合リクエスト]** ＞ **[編集]** ＞ **「Lambdaプロキシ統合」にチェックを入れて保存** し、再デプロイすること。

### 12-1. POST /transaction（データ保存）のテスト

ターミナルで以下を実行する（`YOUR_API_URL` を実際の URL に置き換える）。

```bash
curl -X POST https://YOUR_API_URL/dev/transaction \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "date": "2024-03-28",
    "amount": 800,
    "item": "コーヒー"
  }'
```

**期待するレスポンス:**

```json
{"message":"保存しました","id":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

### 12-2. GET /history（履歴取得）のテスト

```bash
curl "https://YOUR_API_URL/dev/history?userId=test-user-001"
```

**期待するレスポンス:**

```json
[
  {
    "userId": "test-user-001",
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "date": "2024-03-28",
    "amount": 800,
    "item": "コーヒー",
    "groupId": null,
    "createdAt": "2024-03-28T00:00:00.000Z"
  }
]
```

DynamoDB コンソールでもテーブルにレコードが入っていることを確認する。

### 12-3. GET /summary（期間集計）のテスト

```bash
curl "https://YOUR_API_URL/dev/summary?userId=test-user-001&startDate=2024-03-01&endDate=2024-03-31"
```

**期待するレスポンス:**

```json
{"total":800}
```

### 12-4. フロントエンドへの API URL の設定

動作確認ができたら `frontend/src/constants.ts` の `API_BASE_URL` を実際の値に更新する。

```typescript
// 末尾に /dev まで含める
export const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev'
```

---
