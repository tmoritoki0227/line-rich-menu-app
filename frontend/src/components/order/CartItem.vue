<template>
  <!-- カート内の1商品行 -->
  <div class="flex items-start gap-3 py-3 border-b border-gray-100">
    <div class="flex-1 min-w-0">
      <p class="font-medium text-gray-800 text-sm">{{ item.name }}</p>
      <!-- 選択中のオプションを表示 -->
      <p
        v-if="optionText"
        class="text-xs text-gray-500 mt-0.5"
      >
        {{ optionText }}
      </p>
      <p class="text-green-600 font-bold text-sm mt-1">
        ¥{{ item.unitPrice.toLocaleString() }}
      </p>
    </div>

    <!-- 数量操作 -->
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        @click="$emit('update', item.cartId, item.quantity - 1)"
        class="w-7 h-7 rounded-full border border-gray-300 text-sm flex items-center justify-center"
      >
        －
      </button>
      <span class="w-5 text-center text-sm font-bold">{{ item.quantity }}</span>
      <button
        @click="$emit('update', item.cartId, item.quantity + 1)"
        class="w-7 h-7 rounded-full border border-gray-300 text-sm flex items-center justify-center"
      >
        ＋
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CartItem } from '../../composables/useCart'

const props = defineProps<{ item: CartItem }>()

defineEmits<{
  update: [cartId: string, quantity: number]
}>()

// { "サイズ": "M", "温度": "アイス" } → "M・アイス"
const optionText = computed(() =>
  Object.values(props.item.selectedOptions).filter(Boolean).join('・')
)
</script>
