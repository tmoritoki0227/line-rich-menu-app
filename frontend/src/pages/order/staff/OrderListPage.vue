<template>
  <div class="min-h-screen bg-gray-100 pb-6">
    <!-- ヘッダー -->
    <header class="bg-white px-4 py-3 shadow-sm flex justify-between items-center sticky top-0 z-10">
      <h1 class="text-lg font-bold text-gray-800">📋 注文一覧</h1>
      <span class="text-xs text-gray-400 flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse"></span>
        自動更新中
      </span>
    </header>

    <!-- ローディング -->
    <div v-if="isLoading" class="flex justify-center items-center h-48">
      <p class="text-gray-500">読み込み中...</p>
    </div>

    <!-- 注文なし -->
    <div v-else-if="orders.length === 0" class="flex flex-col items-center justify-center h-64 gap-2">
      <p class="text-3xl">🎉</p>
      <p class="text-gray-500">現在対応中の注文はありません</p>
    </div>

    <!-- 注文一覧 -->
    <div v-else class="p-4 space-y-3">
      <OrderCard
        v-for="order in orders"
        :key="order.orderId"
        :order="order"
        @detail="$router.push(`/order/staff/${$event}`)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useStaffOrders } from '../../../composables/useOrder'
import OrderCard from '../../../components/order/OrderCard.vue'

const { orders, isLoading, startPolling } = useStaffOrders()

onMounted(() => {
  startPolling()
})
</script>
