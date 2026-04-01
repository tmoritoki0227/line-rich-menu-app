<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">

    <!-- 準備中 -->
    <template v-if="!orderStatus || orderStatus.status === 'pending'">
      <div class="text-6xl mb-4 animate-pulse">⏳</div>
      <h2 class="text-xl font-bold text-gray-800 mb-1">ただいま準備中です</h2>
      <p class="text-4xl font-bold text-green-600 my-4">
        番号 {{ orderStatus?.orderNumber ?? '---' }}
      </p>
      <div class="bg-white rounded-xl shadow-sm w-full max-w-sm p-4 space-y-1 mb-6">
        <div
          v-for="item in orderStatus?.items"
          :key="item.itemId + item.quantity"
          class="flex justify-between text-sm"
        >
          <span class="text-gray-700">{{ item.name }} × {{ item.quantity }}</span>
          <span class="text-gray-500">¥{{ (item.price * item.quantity).toLocaleString() }}</span>
        </div>
      </div>
      <p class="text-xs text-gray-400">画面は自動で更新されます</p>
    </template>

    <!-- 準備完了 -->
    <template v-else-if="orderStatus.status === 'ready'">
      <div class="text-6xl mb-4">✅</div>
      <h2 class="text-xl font-bold text-green-600 mb-1">準備ができました！</h2>
      <p class="text-4xl font-bold text-gray-800 my-4">
        番号 {{ orderStatus.orderNumber }}
      </p>
      <p class="text-gray-600 text-center">カウンターまでお越しください</p>
    </template>

    <!-- 受け取り済み -->
    <template v-else>
      <div class="text-6xl mb-4">🎉</div>
      <h2 class="text-xl font-bold text-gray-800 mb-1">ありがとうございました</h2>
      <button
        @click="$router.push('/order')"
        class="mt-6 bg-green-500 text-white px-6 py-3 rounded-xl font-bold"
      >
        続けて注文する
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useOrder } from '../../composables/useOrder'

const route = useRoute()
const { orderStatus, startPolling } = useOrder()

onMounted(() => {
  const orderId = route.params.orderId as string
  startPolling(orderId)
})
</script>
