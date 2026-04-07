// 家計簿のビジネスロジックを担当する（Service 層）
//
// この層の責務: ビジネスルールの実装（バリデーション・集計・フィルタ）。
// HTTP（APIGatewayProxyEvent）の詳細は知らない。
// DynamoDB の詳細も知らない（Repository 経由で操作する）。

import { putTransaction, queryByUserId } from '../repositories/transactionRepository'
import type { Transaction, HistoryItem } from '../types'

/**
 * 家計簿を新規作成して DynamoDB に保存する
 *
 * @param params.userId  - LINE ユーザー ID
 * @param params.groupId - グループトークの ID（個人トークの場合は省略）
 * @param params.date    - 日付（"YYYY-MM-DD"）
 * @param params.amount  - 金額（円）
 * @param params.item    - 品物名
 * @returns 作成されたレコードの ID（UUID）
 */
export async function createTransaction(params: {
  userId: string
  groupId?: string
  date: string
  amount: number
  item: string
}): Promise<string> {
  const id = crypto.randomUUID()
  const transaction: Transaction = {
    userId: params.userId,
    id,
    date: params.date,
    amount: Number(params.amount),
    item: params.item,
    groupId: params.groupId ?? null,
    createdAt: new Date().toISOString(),
  }
  await putTransaction(transaction)
  return id
}

/**
 * 指定ユーザーの家計簿履歴を最新 20 件取得する
 *
 * @param userId - LINE ユーザー ID
 */
export async function listHistory(userId: string): Promise<Record<string, unknown>[]> {
  return queryByUserId(userId, 20)
}

/**
 * 指定期間の支出合計を集計する
 *
 * DynamoDB には日付専用インデックスがないため全件取得後にアプリ側でフィルタする。
 * データ量が増えた場合は GSI（グローバルセカンダリインデックス）の追加を検討すること。
 *
 * @param userId    - LINE ユーザー ID
 * @param startDate - 集計開始日（"YYYY-MM-DD"）
 * @param endDate   - 集計終了日（"YYYY-MM-DD"）
 * @returns 指定期間の支出合計（円）
 */
export async function calcSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const items = await queryByUserId(userId)
  // "YYYY-MM-DD" 形式は辞書順 = 日付順なので文字列比較でフィルタできる
  return items
    .filter(record => {
      const d = String(record.date)
      return d >= startDate && d <= endDate
    })
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0)
}

/**
 * 当月の支出合計を返す（LINE Webhook の「合計」キーワード用）
 *
 * @param userId - LINE ユーザー ID
 * @returns 当月の支出合計（円）
 */
export async function calcMonthlyTotal(userId: string): Promise<number> {
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const items = await queryByUserId(userId)
  return items
    .filter(item => String(item.date).startsWith(yearMonth))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
}

/**
 * 最新 N 件の履歴を整形して返す（LINE Webhook の「最新の履歴を表示」キーワード用）
 *
 * @param userId - LINE ユーザー ID
 * @param limit  - 取得件数の上限（デフォルト: 5）
 * @returns 最新 N 件の履歴（createdAt 降順）
 */
export async function listRecentHistory(userId: string, limit = 5): Promise<HistoryItem[]> {
  // SK が UUID（ランダム）のため DynamoDB のソート順は日付順にならない
  // 全件取得 → アプリ側で createdAt 降順ソート → 上位 limit 件を返す
  const items = await queryByUserId(userId)
  return items
    .map(record => {
      const createdAt = String(record.createdAt ?? '')
      // createdAt（UTC）を JST（+9h）に変換して "HH:MM" を取り出す
      const jstTime = createdAt
        ? new Date(new Date(createdAt).getTime() + 9 * 60 * 60 * 1000)
            .toISOString()
            .substring(11, 16)
        : '--:--'
      return {
        date: String(record.date),
        time: jstTime,
        item: String(record.item),
        amount: Number(record.amount),
        createdAt,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}
