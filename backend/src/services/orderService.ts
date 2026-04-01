// 注文のビジネスロジック
//
// 責務: 注文番号の採番・バリデーション・集計など。DynamoDB 操作は repository に任せる。

import { randomUUID } from 'crypto'
import {
  putOrder,
  getOrderById,
  queryOrdersByStatus,
  updateOrderStatus,
  OrderItem,
  OrderRecord,
  OrderStatus,
} from '../repositories/orderRepository'

// 注文作成のパラメータ
export interface CreateOrderParams {
  userId: string
  userName: string
  items: OrderItem[]
  totalPrice: number
}

// 注文番号を採番する（今日の日付 + ランダム3桁）
// 例: 042
// 勉強用なので簡易実装。本番は DynamoDB でアトミックカウンターを使う。
const generateOrderNumber = (): number => {
  return Math.floor(Math.random() * 900) + 100  // 100〜999
}

// 注文を作成して orderId と orderNumber を返す
export const createOrder = async (
  params: CreateOrderParams
): Promise<{ orderId: string; orderNumber: number }> => {
  const orderId     = randomUUID()
  const orderNumber = generateOrderNumber()
  const createdAt   = new Date().toISOString()

  const order: OrderRecord = {
    orderId,
    orderNumber,
    status:     'pending',
    userId:     params.userId,
    userName:   params.userName,
    items:      params.items,
    totalPrice: params.totalPrice,
    createdAt,
  }

  await putOrder(order)
  return { orderId, orderNumber }
}

// 注文を1件取得
export const getOrder = async (orderId: string): Promise<OrderRecord | null> => {
  return getOrderById(orderId)
}

// スタッフ用: pending と ready の注文一覧を取得（古い順）
export const getActiveOrders = async (): Promise<OrderRecord[]> => {
  const [pending, ready] = await Promise.all([
    queryOrdersByStatus('pending'),
    queryOrdersByStatus('ready'),
  ])
  // pending → ready の順に並べる（スタッフが対応順を把握しやすいよう）
  return [...pending, ...ready]
}

// ステータスを更新
export const changeOrderStatus = async (
  orderId: string,
  status: OrderStatus
): Promise<void> => {
  await updateOrderStatus(orderId, status)
}
