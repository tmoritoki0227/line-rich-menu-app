<template>
  <div class="min-h-screen bg-gray-50 pb-32">
    <!-- ヘッダー -->
    <header class="bg-white px-4 py-3 shadow-sm flex items-center gap-3">
      <button @click="$router.back()" class="text-gray-500">← 戻る</button>
      <h1 class="text-lg font-bold text-gray-800">注文内容の確認</h1>
    </header>

    <div class="p-4 space-y-3">
      <!-- 商品一覧 -->
      <div class="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        <div
          v-for="item in cartItems"
          :key="item.cartId"
          class="px-4 py-3 flex justify-between items-start"
        >
          <div>
            <p class="text-sm font-medium text-gray-800">{{ item.name }}</p>
            <p v-if="optionText(item)" class="text-xs text-gray-500">{{ optionText(item) }}</p>
            <p class="text-xs text-gray-500">× {{ item.quantity }}</p>
          </div>
          <span class="text-sm font-bold text-gray-800">
            ¥{{ (item.unitPrice * item.quantity).toLocaleString() }}
          </span>
        </div>
      </div>

      <!-- 合計 -->
      <div class="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center">
        <span class="font-medium text-gray-600">合計</span>
        <span class="text-xl font-bold text-green-600">¥{{ totalPrice.toLocaleString() }}</span>
      </div>

      <!-- エラー -->
      <p v-if="errorMessage" class="text-red-500 text-sm text-center">{{ errorMessage }}</p>
    </div>

    <!-- 注文するボタン -->
    <div class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
      <button
        @click="handleOrder"
        :disabled="isSubmitting"
        class="w-full bg-green-500 text-white py-3 rounded-xl font-bold disabled:opacity-60"
      >
        {{ isSubmitting ? '注文中...' : '注文する' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useCart } from '../../composables/useCart'
import { useOrder } from '../../composables/useOrder'
import type { CartItem } from '../../composables/useCart'

const router = useRouter()
const { cartItems, totalPrice, clearCart } = useCart()
const { isSubmitting, errorMessage, submitOrder } = useOrder()

const optionText = (item: CartItem) =>
  Object.values(item.selectedOptions).filter(Boolean).join('・')

const handleOrder = async () => {
  // LIFF から userId / userName を取得（未ログインの場合はダミー値）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liff = (window as any).liff
  let userId   = 'guest'
  let userName = 'ゲスト'

  try {
    if (liff?.isLoggedIn?.()) {
      const profile = await liff.getProfile()
      userId   = profile.userId
      userName = profile.displayName
    }
  } catch {
    // LIFF未初期化（ブラウザ直接アクセス時）はゲストとして進む
  }

  const result = await submitOrder({
    userId,
    userName,
    items:      cartItems.value,
    totalPrice: totalPrice.value,
  })

  if (result) {
    clearCart()
    router.push(`/order/status/${result.orderId}`)
  }
}
</script>
