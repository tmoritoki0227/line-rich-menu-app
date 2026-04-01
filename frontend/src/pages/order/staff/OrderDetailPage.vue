<template>
  <div class="min-h-screen bg-gray-50 pb-6">
    <!-- ヘッダー -->
    <header class="bg-white px-4 py-3 shadow-sm flex items-center gap-3">
      <button @click="$router.back()" class="text-gray-500">← 戻る</button>
      <h1 class="text-lg font-bold text-gray-800">
        注文 #{{ order?.orderNumber }}　{{ order?.userName }}さん
      </h1>
    </header>

    <!-- ローディング -->
    <div v-if="isLoading" class="flex justify-center items-center h-48">
      <p class="text-gray-500">読み込み中...</p>
    </div>

    <div v-else-if="order" class="p-4 space-y-3">
      <!-- 商品一覧 -->
      <div class="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        <div
          v-for="item in order.items"
          :key="item.itemId"
          class="px-4 py-3 flex justify-between items-start"
        >
          <div>
            <p class="text-sm font-medium text-gray-800">{{ item.name }}</p>
            <p v-if="optionText(item)" class="text-xs text-gray-500">{{ optionText(item) }}</p>
            <p class="text-xs text-gray-500">× {{ item.quantity }}</p>
          </div>
          <span class="text-sm text-gray-700">
            ¥{{ (item.price * item.quantity).toLocaleString() }}
          </span>
        </div>
      </div>

      <!-- 合計 -->
      <div class="bg-white rounded-xl shadow-sm p-4 flex justify-between">
        <span class="text-gray-600">合計</span>
        <span class="font-bold text-green-600 text-lg">¥{{ order.totalPrice.toLocaleString() }}</span>
      </div>

      <!-- 受付時刻 -->
      <p class="text-xs text-gray-400 text-center">{{ timeLabel }}</p>

      <!-- ステータス変更ボタン -->
      <div class="space-y-2 pt-2">
        <button
          v-if="order.status === 'pending'"
          @click="changeStatus('ready')"
          :disabled="isUpdating"
          class="w-full bg-green-500 text-white py-3 rounded-xl font-bold disabled:opacity-60"
        >
          ✅ 準備完了にする
        </button>
        <button
          v-if="order.status === 'ready'"
          @click="changeStatus('done')"
          :disabled="isUpdating"
          class="w-full bg-gray-500 text-white py-3 rounded-xl font-bold disabled:opacity-60"
        >
          受け取り済みにする
        </button>
        <p v-if="order.status === 'done'" class="text-center text-gray-400 py-3">
          この注文は完了しています
        </p>
      </div>
    </div>

    <div v-else class="text-center text-gray-500 mt-20">
      注文が見つかりません
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { API_BASE_URL } from '../../../constants'
import type { OrderRecord, OrderItem } from '../../../types/order'

const route  = useRoute()
const router = useRouter()

const order     = ref<OrderRecord | null>(null)
const isLoading = ref(true)
const isUpdating = ref(false)

const orderId = route.params.orderId as string

const optionText = (item: OrderItem) =>
  Object.values(item.selectedOptions).filter(Boolean).join('・')

const timeLabel = computed(() => {
  if (!order.value) return ''
  const d = new Date(order.value.createdAt)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 受付`
})

const changeStatus = async (status: 'ready' | 'done') => {
  isUpdating.value = true
  try {
    await axios.put(`${API_BASE_URL}/staff/orders/${orderId}/status`, { status })
    if (order.value) order.value.status = status
    // done になったら一覧に戻る
    if (status === 'done') router.push('/order/staff')
  } finally {
    isUpdating.value = false
  }
}

onMounted(async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/order/${orderId}`)
    order.value = res.data
  } catch {
    order.value = null
  } finally {
    isLoading.value = false
  }
})
</script>
