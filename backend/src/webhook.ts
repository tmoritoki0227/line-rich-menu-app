
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
  // 全件取得してアプリ側で日付降順にソートし、上位 limit 件を返す
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
      // 各行を "日付 品物 金額円" 形式でフォーマット
      const lines = items.map(i => `${i.date} ${i.time}  ${i.item}  ${i.amount.toLocaleString()}円`)
      const message = `📋 最新${items.length}件の履歴:\n${lines.join('\n')}`
      await replyToLine(replyToken, message)
    }

  } else {
    // 上記以外は使い方の案内を返す
    await replyToLine(
      replyToken,
      '「合計」→ 今月の合計\n「最新の履歴を表示」→ 最新履歴\n\n入力はリッチメニューの「入力フォーム」から行ってください。'
    )
  }
}