// 家計簿データの DynamoDB 操作だけを担当する（Repository 層）
//
// この層の責務: DynamoDB への読み書きのみ。
// ビジネスロジック（集計・フィルタ・バリデーション）は書かない。
// DynamoDB の実装詳細をここに閉じ込めることで、
// 将来 RDS や別の DB に切り替えるときもこのファイルだけ変更すればよい。

import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../clients/dynamodb'
import type { Transaction } from '../types'

/**
 * 家計簿レコードを 1 件書き込む
 */
export async function putTransaction(transaction: Transaction): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: transaction,
    })
  )
}

/**
 * 指定ユーザーの家計簿レコードを全件取得する
 *
 * @param userId - LINE ユーザー ID（パーティションキー）
 * @param limit  - 取得件数の上限（省略時は全件）
 */
export async function queryByUserId(
  userId: string,
  limit?: number
): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false, // 新しい順（SK の降順）
      ...(limit !== undefined && { Limit: limit }),
    })
  )
  return result.Items ?? []
}
