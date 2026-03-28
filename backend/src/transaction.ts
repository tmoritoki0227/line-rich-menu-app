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