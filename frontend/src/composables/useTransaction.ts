// 家計簿の保存・集計ロジックを担当するコンポーザブル
//
// liffContext を「ゲッター関数 () => LiffContext | null」の形で受け取ることで、
// useLiff との疎結合（互いに依存しない関係）を保ちつつリアクティビティを維持する。
// TransactionForm.vue と SummaryCard.vue の両方から呼び出せる。

import { ref } from 'vue'
import liff from '@line/liff'
import axios from 'axios'
import type { LiffContext } from '../types'
import { API_BASE_URL } from '../constants'

export function useTransaction(getLiffContext: () => LiffContext | null) {
  const isSaving = ref(false)               // true の間「送信中...」を表示
  const isSummaryLoading = ref(false)       // true の間「集計中...」を表示
  const summaryTotal = ref<number | null>(null) // 集計結果（null = 未集計）

  /**
   * 家計簿を保存する
   * ① LINE トークルームにメッセージを送信 → ② DynamoDB に保存
   */
  async function save(params: { date: string; amount: number; item: string }) {
    if (!params.amount) {
      alert('金額を入力してください')
      return
    }
    const ctx = getLiffContext()
    if (!ctx) return

    isSaving.value = true
    try {
      // ① LINE のトークルームにメッセージを送信
      await liff.sendMessages([
        {
          type: 'text',
          text: `💰 家計簿記録完了！\n日付: ${params.date}\n金額: ${params.amount}円\n品物: ${params.item}`,
        },
      ])

      // ② バックエンド API にデータを保存
      await axios.post(`${API_BASE_URL}/transaction`, {
        userId: ctx.userId,
        groupId: ctx.groupId,
        ...params,
      })

      alert('保存しました！！！')
    } catch (err) {
      alert(`エラーが発生しました: ${(err as Error).message}`)
    } finally {
      isSaving.value = false
    }
  }

  /**
   * 指定期間の支出合計を取得する
   */
  async function fetchSummary(params: { startDate: string; endDate: string }) {
    const ctx = getLiffContext()
    if (!ctx) return
    if (!params.startDate || !params.endDate) {
      alert('集計期間を入力してください')
      return
    }

    isSummaryLoading.value = true
    summaryTotal.value = null
    try {
      const res = await axios.get<{ total: number }>(`${API_BASE_URL}/summary`, {
        params: {
          userId: ctx.userId,
          startDate: params.startDate,
          endDate: params.endDate,
        },
      })
      summaryTotal.value = res.data.total
    } catch (err) {
      alert(`集計エラー: ${(err as Error).message}`)
    } finally {
      isSummaryLoading.value = false
    }
  }

  return { isSaving, isSummaryLoading, summaryTotal, save, fetchSummary }
}
