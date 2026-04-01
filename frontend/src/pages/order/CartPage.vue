<template>
  <div class="min-h-screen bg-gray-50 pb-32">
    <!-- ヘッダー -->
    <header class="bg-white px-4 py-3 shadow-sm flex items-center gap-3">
      <button @click="$router.back()" class="text-gray-500">← 戻る</button>
      <h1 class="text-lg font-bold text-gray-800">カートの中身</h1>
    </header>

    <!-- カートが空 -->
    <div v-if="cartItems.length === 0" class="flex flex-col items-center justify-center h-64 gap-3">
      <p class="text-4xl">🛒</p>
      <p class="text-gray-500">カートに商品がありません</p>
      <button
        @click="$router.push('/order')"
        class="text-green-600 underline text-sm"
      >
        メニューに戻る
      </button>
    </div>

    <div v-else class="p-4 space-y-1">
      <!-- 商品一覧 -->
      <div class="bg-white rounded-xl shadow-sm px-4">
        <CartItemRow
          v-for="item in cartItems"
          :key="item.cartId"
          :item="item"
          @update="updateQuantity"
        />
      </div>

      <!-- 合計 -->
      <div class="bg-white rounded-xl shadow-sm p-4 mt-3 flex justify-between items-center">
        <span class="text-gray-600 font-medium">合計</span>
        <span class="text-xl font-bold text-green-600">¥{{ totalPrice.toLocaleString() }}</span>
      </div>
    </div>

    <!-- 注文確認へ -->
    <div v-if="cartItems.length > 0" class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
      <button
        @click="$router.push('/order/confirm')"
        class="w-full bg-green-500 text-white py-3 rounded-xl font-bold"
      >
        注文確認へ進む
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCart } from '../../composables/useCart'
import CartItemRow from '../../components/order/CartItem.vue'

const { cartItems, totalPrice, updateQuantity } = useCart()
</script>
