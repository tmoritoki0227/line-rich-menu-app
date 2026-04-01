// POST /order, GET /order/{orderId} ハンドラ
//
// 責務: HTTPリクエストの解析・バリデーション・レスポンス返却のみ。

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createOrder, getOrder } from '../services/orderService'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

// POST /order — 注文作成
export const postOrder = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Request body is required' }) }
  }

  const body = JSON.parse(event.body)
  const { userId, userName, items, totalPrice } = body

  if (!userId || !userName || !items || !Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'userId, userName, items are required' }) }
  }

  const result = await createOrder({ userId, userName, items, totalPrice: totalPrice ?? 0 })

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(result),
  }
}

// GET /order/{orderId} — 注文状況確認（お客がポーリングで呼ぶ）
export const getOrderById = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const orderId = event.pathParameters?.orderId

  if (!orderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'orderId is required' }) }
  }

  const order = await getOrder(orderId)

  if (!order) {
    return { statusCode: 404, headers, body: JSON.stringify({ message: 'Order not found' }) }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(order),
  }
}
