// 家計簿 API のリクエスト受付・レスポンス整形を担当する（Handler 層）
//
// この層の責務: HTTP の入出力（APIGatewayProxyEvent のパース・レスポンス生成）のみ。
// ビジネスロジックは services/transactionService に委譲する。

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createTransaction, listHistory, calcSummary } from '../services/transactionService'

// CORS ヘッダー: ブラウザ（LIFF）から API Gateway を呼び出す際に必要
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * POST /transaction — 家計簿を保存する
 *
 * @param event - API Gateway リクエストイベント
 */
export async function saveTransaction(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}')
  const { userId, groupId, date, amount, item } = body

  if (!userId || !date || !amount || !item) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId, date, amount, item は必須です' }),
    }
  }

  const id = await createTransaction({ userId, groupId, date, amount, item })

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ message: '保存しました', id }),
  }
}

/**
 * GET /history?userId=xxx — 家計簿履歴を取得する
 *
 * @param event - API Gateway リクエストイベント
 */
export async function getHistory(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const userId = event.queryStringParameters?.userId

  if (!userId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId は必須です' }),
    }
  }

  const items = await listHistory(userId)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(items),
  }
}

/**
 * GET /summary?userId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — 期間集計する
 *
 * @param event - API Gateway リクエストイベント
 */
export async function getSummary(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const { userId, startDate, endDate } = event.queryStringParameters ?? {}

  if (!userId || !startDate || !endDate) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'userId, startDate, endDate は必須です' }),
    }
  }

  const total = await calcSummary(userId, startDate, endDate)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ total }),
  }
}
