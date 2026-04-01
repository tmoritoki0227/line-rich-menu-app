// GET /staff/orders, PUT /staff/orders/{orderId}/status ハンドラ
//
// 責務: HTTPリクエストの解析・バリデーション・レスポンス返却のみ。

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getActiveOrders, changeOrderStatus } from '../services/orderService'
import { OrderStatus } from '../repositories/orderRepository'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const VALID_STATUSES: OrderStatus[] = ['pending', 'ready', 'done']

// GET /staff/orders — 未完了注文一覧
export const getStaffOrders = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const orders = await getActiveOrders()

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ orders }),
  }
}

// PUT /staff/orders/{orderId}/status — ステータス更新
export const putOrderStatus = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const orderId = event.pathParameters?.orderId

  if (!orderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'orderId is required' }) }
  }

  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Request body is required' }) }
  }

  const { status } = JSON.parse(event.body)

  if (!VALID_STATUSES.includes(status)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` }),
    }
  }

  await changeOrderStatus(orderId, status)

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'updated' }),
  }
}
