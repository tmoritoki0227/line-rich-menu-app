<template>
  <!-- スタッフ画面の注文カード -->
  <div
    class="bg-white rounded-xl shadow-sm p-4 border-l-4"
    :class="borderColor"
  >
    <div class="flex justify-between items-start">
      <div>
        <span class="text-lg font-bold text-gray-800">#{{ order.orderNumber }}</span>
        <span class="ml-2 text-gray-600">{{ order.userName }}さん</span>
      </div>
      <span
        class="text-xs px-2 py-1 rounded-full font-medium"
        :class="statusBadge"
      >
        {{ statusLabel }}
      </span>
    </div>

    <!-- 商品一覧（簡略表示） -->
    <p class="text-sm text-gray-600 mt-2">
      {{ itemSummary }}
    </p>

    <div class="flex justify-between items-center mt-2">
      <span class="text-xs text-gray-400">{{ timeLabel }}</span>
      <span class="font-bold text-green-600">¥{{ order.totalPrice.toLocaleString() }}</span>
    </div>

    <button
      @click="$emit('detail', order.orderId)"
      class="mt-3 w-full text-sm text-green-600 border border-green-500 rounded-lg py-1.5"
    >
      詳細・ステータス変更 →
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OrderRecord } from '../../types/order'

const props = defineProps<{ order: OrderRecord }>()
defineEmits<{ detail: [orderId: string] }>()

const borderColor = computed(() => ({
  'border-yellow-400': props.order.status === 'pending',
  'border-green-400':  props.order.status === 'ready',
  'border-gray-300':   props.order.status === 'done',
}))

const statusBadge = computed(() => ({
  'bg-yellow-100 text-yellow-700': props.order.status === 'pending',
  'bg-green-100 text-green-700':   props.order.status === 'ready',
  'bg-gray-100 text-gray-500':     props.order.status === 'done',
}))

const statusLabel = computed(() => ({
  pending: '準備中',
  ready:   '完了',
  done:    '受取済',
}[props.order.status]))

const itemSummary = computed(() =>
  props.order.items
    .map(i => `${i.name}×${i.quantity}`)
    .join('　')
)

const timeLabel = computed(() => {
  const d = new Date(props.order.createdAt)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 受付`
})
</script>
