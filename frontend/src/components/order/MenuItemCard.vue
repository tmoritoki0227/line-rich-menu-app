<template>
  <!-- メニューの1商品カード -->
  <div
    class="bg-white rounded-xl shadow-sm overflow-hidden"
    :class="{ 'opacity-50': !item.available }"
  >
    <!-- 商品画像 -->
    <div class="w-full h-36 bg-gray-100 overflow-hidden">
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        :alt="item.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-3xl">
        ☕
      </div>
    </div>

    <div class="p-3">
      <p class="font-semibold text-gray-800 text-sm">{{ item.name }}</p>
      <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ item.description }}</p>
      <div class="flex items-center justify-between mt-2">
        <span class="text-green-600 font-bold">¥{{ item.price.toLocaleString() }}</span>
        <button
          @click="handleAdd"
          :disabled="!item.available"
          class="bg-green-500 text-white text-xs px-3 py-1.5 rounded-full disabled:opacity-40"
        >
          {{ item.available ? '追加' : '売切' }}
        </button>
      </div>
    </div>

    <!-- オプション選択モーダル -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-end z-50"
      @click.self="showModal = false"
    >
      <div class="bg-white w-full rounded-t-2xl p-5 space-y-4">
        <h3 class="font-bold text-lg">{{ item.name }}</h3>

        <OptionSelector
          :options="item.options"
          :selected="selectedOptions"
          @update="selectedOptions = $event"
        />

        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-600">数量</span>
          <button @click="qty = Math.max(1, qty - 1)" class="w-8 h-8 rounded-full border text-lg">－</button>
          <span class="w-6 text-center font-bold">{{ qty }}</span>
          <button @click="qty++" class="w-8 h-8 rounded-full border text-lg">＋</button>
        </div>

        <div class="flex justify-between items-center">
          <span class="text-gray-500 text-sm">小計</span>
          <span class="font-bold text-green-600">¥{{ subtotal.toLocaleString() }}</span>
        </div>

        <button
          @click="addToCartAndClose"
          class="w-full bg-green-500 text-white py-3 rounded-xl font-bold"
        >
          カートに追加
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import OptionSelector from './OptionSelector.vue'
import { useCart } from '../../composables/useCart'
import type { MenuItem } from '../../types/order'

const props = defineProps<{ item: MenuItem }>()

const { addToCart } = useCart()

const showModal       = ref(false)
const qty             = ref(1)
const selectedOptions = ref<Record<string, string>>({})

// オプションの追加料金合計
const extraPrice = computed(() => {
  let extra = 0
  for (const opt of props.item.options) {
    const choice = selectedOptions.value[opt.label]
    const idx    = opt.choices.indexOf(choice)
    if (idx >= 0) extra += opt.extraPrice[idx] ?? 0
  }
  return extra
})

const subtotal = computed(() => (props.item.price + extraPrice.value) * qty.value)

const handleAdd = () => {
  // オプションなしなら即追加、あればモーダルを出す
  if (props.item.options.length === 0) {
    addToCart(props.item, {}, 1)
    return
  }
  // デフォルト選択を設定
  const defaults: Record<string, string> = {}
  for (const opt of props.item.options) {
    defaults[opt.label] = opt.choices[0]
  }
  selectedOptions.value = defaults
  qty.value = 1
  showModal.value = true
}

const addToCartAndClose = () => {
  addToCart(props.item, selectedOptions.value, qty.value)
  showModal.value = false
}
</script>
