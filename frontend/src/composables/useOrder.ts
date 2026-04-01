// 注文送信・状態取得のロジック
//
// 責務: APIへの注文作成リクエスト・注文状況のポーリング。

import { ref, onUnmounted } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../constants'
import type { CartItem } from './useCart'
import type { OrderRecord } from '../types/order'

export const useOrder = () => {
  const isSubmitting  = ref(false)
  const orderResult   = ref<{ orderId: string; orderNumber: number } | null>(null)
  const orderStatus   = ref<OrderRecord | null>(null)
  const errorMessage  = ref('')

  let pollingTimer: ReturnType<typeof setInterval> | null = null

  // 注文を送信する
  const submitOrder = async (params: {
    userId: string
    userName: string
    items: CartItem[]
    totalPrice: number
  }): Promise<{ orderId: string; orderNumber: number } | null> => {
    isSubmitting.value = true
    errorMessage.value = ''

    try {
      // CartItem → API が期待する形に変換
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
    } catch (err) {
      errorMessage.value = '注文の送信に失敗しました'
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  // 注文状況をポーリングで取得する（5秒ごと）
  // ready または done になったら自動停止
  const startPolling = (orderId: string) => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/order/${orderId}`)
        orderStatus.value = res.data

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

// スタッフ用: 注文一覧を取得（ポーリング）
export const useStaffOrders = () => {
  const orders       = ref<OrderRecord[]>([])
  const isLoading    = ref(false)

  let pollingTimer: ReturnType<typeof setInterval> | null = null

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/staff/orders`)
      orders.value = res.data.orders
    } catch {
      // 静かに失敗
    }
  }

  const startPolling = () => {
    isLoading.value = true
    fetchOrders().finally(() => { isLoading.value = false })
    pollingTimer = setInterval(fetchOrders, 10000)  // 10秒ごと
  }

  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  // ステータスを更新する
  const updateStatus = async (orderId: string, status: string) => {
    await axios.put(`${API_BASE_URL}/staff/orders/${orderId}/status`, { status })
    await fetchOrders()  // 更新後に一覧を再取得
  }

  onUnmounted(stopPolling)

  return { orders, isLoading, startPolling, stopPolling, updateStatus, fetchOrders }
}
