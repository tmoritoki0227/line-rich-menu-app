// LINE Webhook のリクエスト受付・レスポンス整形を担当する（Handler 層）
//
// この層の責務: HTTP の入出力（署名ヘッダーの取り出し・200 返却）のみ。
// 署名検証とイベント処理は services/lineService に委譲する。

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { verifyLineSignature, processEvents } from '../services/lineService'

/**
 * POST /webhook — LINE Webhook を受信して処理する
 *
 * @param event - API Gateway リクエストイベント
 */
export async function handleWebhook(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const body = event.body ?? ''
  const signature = event.headers['x-line-signature'] ?? ''

  // 署名検証（LINE サーバー以外からの不正リクエストを弾く）
  if (!verifyLineSignature(body, signature)) {
    console.warn('Invalid LINE signature')
    return { statusCode: 401, body: 'Unauthorized' }
  }

  await processEvents(body)

  // LINE サーバーには必ず 200 を返す
  // 200 以外や応答遅延があると LINE がリトライを繰り返してしまう
  return { statusCode: 200, body: 'OK' }
}
