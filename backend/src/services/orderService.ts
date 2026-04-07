// 注文のビジネスロジック（Service 層）
//
// 責務: 注文番号の採番・ステータス管理・データ整形など。
// DynamoDB 操作は repositories/orderRepository に委譲する。

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

/** 注文作成のパラメータ */
export interface CreateOrderParams {
  userId: string      // 注文したユーザーの LINE ID
  userName: string    // 注文したユーザーの表示名
  items: OrderItem[]  // 注文内の商品一覧
  totalPrice: number  // 合計金額（円）
}

/**
 * 注文番号を採番する（ランダム3桁）
 *
 * 簡易実装のため衝突の可能性がある。
 * 本番運用では DynamoDB のアトミックカウンターを使うことを推奨。
 */
const generateOrderNumber = (): number => {
  return Math.floor(Math.random() * 900) + 100  // 100〜999
}

/**
 * 注文を作成して DynamoDB に保存する
 *
 * @param params - 注文作成のパラメータ
 * @returns 作成された注文の ID と注文番号
 */
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

/**
 * orderId で注文を 1 件取得する
 *
 * @param orderId - 取得する注文の ID
 * @returns 注文レコード。見つからない場合は null
 */
export const getOrder = async (orderId: string): Promise<OrderRecord | null> => {
  return getOrderById(orderId)
}

/**
 * スタッフ用: pending と ready の注文一覧を取得する（古い順）
 *
 * done（受け取り済み）は除外する。
 * pending → ready の順に並べてスタッフが対応順を把握しやすくする。
 */
export const getActiveOrders = async (): Promise<OrderRecord[]> => {
  const [pending, ready] = await Promise.all([
    queryOrdersByStatus('pending'),
    queryOrdersByStatus('ready'),
  ])
  return [...pending, ...ready]
}

/**
 * 注文のステータスを更新する
 *
 * @param orderId - 更新する注文の ID
 * @param status  - 新しいステータス（"pending" | "ready" | "done"）
 */
export const changeOrderStatus = async (
  orderId: string,
  status: OrderStatus
): Promise<void> => {
  await updateOrderStatus(orderId, status)
}
