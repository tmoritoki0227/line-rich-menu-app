// 注文送信・状態取得のロジックを担当するコンポーザブル
//
// 責務: 注文作成リクエスト・注文状況のポーリング・スタッフ向け注文一覧の取得。

import { ref, onUnmounted } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../constants'
import type { CartItem } from './useCart'
import type { OrderRecord } from '../types/order'

export const useOrder = () => {
  const isSubmitting  = ref(false)                                        // true の間「送信中...」を表示しボタンを無効化する
  const orderResult   = ref<{ orderId: string; orderNumber: number } | null>(null)  // 作成された注文の ID と注文番号
  const orderStatus   = ref<OrderRecord | null>(null)                      // ポーリングで取得した注文状況
  const errorMessage  = ref('')                                            // エラーメッセージ（空文字のときは表示しない）

  let pollingTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 注文を送信する
   *
   * @returns 作成された注文の ID と注文番号。失敗時は null
   */
  const submitOrder = async (params: {
    userId: string
    userName: string
    items: CartItem[]
    totalPrice: number
  }): Promise<{ orderId: string; orderNumber: number } | null> => {
    isSubmitting.value = true
    errorMessage.value = ''

    try {
      // CartItem → API が期待する形に変換する
      const apiItems = params.items.map(item => ({
        itemId:          item.itemId,
        name:            item.name,
        price:           item.unitPrice,
        quantity:        item.quantity,
        selectedOptions: item.selectedOptions,
      }))

      const res = await axios.post(`${API_BASE_URL}/order`, {
        userId:     params.userId,
        userName:   params.userName,
        items:      apiItems,
        totalPrice: params.totalPrice,
      })

      orderResult.value = res.data
      return res.data
    } catch {
      errorMessage.value = '注文の送信に失敗しました'
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * 注文状況をポーリングで取得する（5秒ごと）
   *
   * ready または done になったら自動停止する。
   * コンポーネントが破棄されたときも onUnmounted で自動停止する。
   *
   * @param orderId - ポーリング対象の注文 ID
   */
  const startPolling = (orderId: string) => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/order/${orderId}`)
        orderStatus.value = res.data

        // ready / done になったらポーリングを止める
        if (res.data.status === 'ready' || res.data.status === 'done') {
          stopPolling()
        }
      } catch {
        // ポーリングは静かに失敗させる（画面をクラッシュさせない）
      }
    }

    fetch()  // 初回は即時実行
    pollingTimer = setInterval(fetch, 5000)
  }

  /** ポーリングを停止する */
  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  // コンポーネントが破棄されたときにポーリングを止める（メモリリーク防止）
  onUnmounted(stopPolling)

  return {
    isSubmitting,
    orderResult,
    orderStatus,
    errorMessage,
    submitOrder,
    startPolling,
    stopPolling,
  }
}

/**
 * スタッフ用: 注文一覧を取得するコンポーザブル（10秒ごとにポーリング）
 */
export const useStaffOrders = () => {
  const orders    = ref<OrderRecord[]>([])
  const isLoading = ref(false)

  let pollingTimer: ReturnType<typeof setInterval> | null = null

  /** 注文一覧を 1 回取得する */
  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/staff/orders`)
      orders.value = res.data.orders
    } catch {
      // 静かに失敗させる
    }
  }

  /**
   * ポーリングを開始する（10秒ごとに一覧を再取得）
   *
   * 初回は即時実行する。
   */
  const startPolling = () => {
    isLoading.value = true
    fetchOrders().finally(() => { isLoading.value = false })
    pollingTimer = setInterval(fetchOrders, 10000)
  }

  /** ポーリングを停止する */
  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  /**
   * 注文のステータスを更新して一覧を再取得する
   *
   * @param orderId - 更新する注文の ID
   * @param status  - 新しいステータス
   */
  const updateStatus = async (orderId: string, status: string) => {
    await axios.put(`${API_BASE_URL}/staff/orders/${orderId}/status`, { status })
    await fetchOrders()  // 更新後に一覧を再取得する
  }

  onUnmounted(stopPolling)

  return { orders, isLoading, startPolling, stopPolling, updateStatus, fetchOrders }
}
