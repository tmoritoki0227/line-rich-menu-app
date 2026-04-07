// 注文テーブル（orders）の DynamoDB 操作（Repository 層）
//
// 責務: DynamoDB への読み書きのみ。ビジネスロジックは書かない。
// テーブル構造: PK = orderId、GSI = status-createdAt-index

import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../clients/dynamodb'

const TABLE_NAME   = process.env.ORDERS_TABLE_NAME ?? 'orders'
const STATUS_INDEX = 'status-createdAt-index'

/** 注文ステータス */
export type OrderStatus = 'pending' | 'ready' | 'done'

/** 注文内の商品 1 行 */
export interface OrderItem {
  itemId: string                           // メニュー商品の ID
  name: string                             // 商品名
  price: number                            // オプション込みの単価
  quantity: number                         // 数量
  selectedOptions: Record<string, string>  // { "サイズ": "M", "温度": "アイス" }
}

/** DynamoDB に保存する注文レコードの型 */
export interface OrderRecord {
  orderId: string       // 注文の一意 ID（UUID）
  orderNumber: number   // スタッフ表示用の注文番号（100〜999）
  status: OrderStatus   // 現在のステータス
  userId: string        // 注文したユーザーの LINE ID
  userName: string      // 注文したユーザーの表示名
  items: OrderItem[]    // 注文内の商品一覧
  totalPrice: number    // 合計金額（円）
  createdAt: string     // 注文日時（ISO 8601）
}

/**
 * 注文を 1 件作成する
 *
 * @param order - 保存する注文レコード
 */
export const putOrder = async (order: OrderRecord): Promise<void> => {
  await docClient.send(
    new PutCommand({ TableName: TABLE_NAME, Item: order })
  )
}

/**
 * orderId で注文を 1 件取得する
 *
 * @param orderId - 取得する注文の ID
 * @returns 注文レコード。見つからない場合は null
 */
export const getOrderById = async (orderId: string): Promise<OrderRecord | null> => {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { orderId } })
  )
  return (result.Item as OrderRecord) ?? null
}

/**
 * ステータスで注文一覧を取得する（GSI: status-createdAt-index）
 *
 * createdAt 昇順（古い注文が上）で返す。
 *
 * @param status - 取得するステータス（"pending" | "ready" | "done"）
 */
export const queryOrdersByStatus = async (status: OrderStatus): Promise<OrderRecord[]> => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },  // status は DynamoDB の予約語のためエイリアスが必要
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: true,   // createdAt 昇順（古い注文が上）
    })
  )
  return (result.Items ?? []) as OrderRecord[]
}

/**
 * 注文のステータスを更新する
 *
 * @param orderId - 更新する注文の ID
 * @param status  - 新しいステータス
 */
export const updateOrderStatus = async (
  orderId: string,
  status: OrderStatus
): Promise<void> => {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: { '#s': 'status' },  // status は DynamoDB の予約語のためエイリアスが必要
      ExpressionAttributeValues: { ':status': status },
    })
  )
}
