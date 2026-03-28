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