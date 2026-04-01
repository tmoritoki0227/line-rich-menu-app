// 注文テーブルの DynamoDB 操作
//
// 責務: DynamoDB への読み書きのみ。ビジネスロジックは書かない。

import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../clients/dynamodb'

const TABLE_NAME = process.env.ORDERS_TABLE_NAME ?? 'orders'
const STATUS_INDEX = 'status-createdAt-index'

// 注文ステータス
export type OrderStatus = 'pending' | 'ready' | 'done'

// 注文商品の1行
export interface OrderItem {
  itemId: string
  name: string
  price: number        // オプション込みの単価
  quantity: number
  selectedOptions: Record<string, string>  // { "サイズ": "M", "温度": "アイス" }
}

// 注文レコード（DynamoDB に保存する形）
export interface OrderRecord {
  orderId: string
  orderNumber: number
  status: OrderStatus
  userId: string
  userName: string
  items: OrderItem[]
  totalPrice: number
  createdAt: string   // ISO 8601
}

// 注文を作成
export const putOrder = async (order: OrderRecord): Promise<void> => {
  await docClient.send(
    new PutCommand({ TableName: TABLE_NAME, Item: order })
  )
}

// orderId で1件取得
export const getOrderById = async (orderId: string): Promise<OrderRecord | null> => {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { orderId } })
  )
  return (result.Item as OrderRecord) ?? null
}

// status で一覧取得（GSI: status-createdAt-index）
// done（受け取り済み）は除外して pending と ready だけ取得する
export const queryOrdersByStatus = async (status: OrderStatus): Promise<OrderRecord[]> => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: true,   // createdAt 昇順（古い注文が上）
    })
  )
  return (result.Items ?? []) as OrderRecord[]
}

// ステータスを更新
export const updateOrderStatus = async (
  orderId: string,
  status: OrderStatus
): Promise<void> => {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { orderId },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
    })
  )
}
