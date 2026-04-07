// GET /staff/orders, PUT /staff/orders/{orderId}/status ハンドラ
//
// 責務: HTTP リクエストの解析・バリデーション・レスポンス返却のみ。
// 注文一覧取得・ステータス更新のロジックは services/orderService に委譲する。

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getActiveOrders, changeOrderStatus } from '../services/orderService'
import { OrderStatus } from '../repositories/orderRepository'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

/** 受け付けるステータス値の一覧（バリデーション用） */
const VALID_STATUSES: OrderStatus[] = ['pending', 'ready', 'done']

/**
 * GET /staff/orders — 未完了注文の一覧を取得する
 *
 * pending と ready の注文を古い順に返す。
 * done（受け取り済み）は除外する。
 */
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

/**
 * PUT /staff/orders/{orderId}/status — 注文ステータスを更新する
 *
 * @param event.pathParameters.orderId - 更新する注文の ID
 * リクエストボディ: { status: "pending" | "ready" | "done" }
 */
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
