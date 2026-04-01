<template>
  <div class="min-h-screen bg-gray-50 pb-24">
    <!-- ヘッダー -->
    <header class="bg-white px-4 py-3 shadow-sm sticky top-0 z-20">
      <h1 class="text-lg font-bold text-gray-800">☕ カフェオーダー</h1>
    </header>

    <!-- ローディング -->
    <div v-if="isLoading" class="flex justify-center items-center h-48">
      <p class="text-gray-500">メニューを読み込み中...</p>
    </div>

    <!-- エラー -->
    <div v-else-if="errorMessage" class="p-4 text-center text-red-500">
      {{ errorMessage }}
    </div>

    <template v-else>
      <!-- カテゴリタブ -->
      <CategoryTabs
        :categories="categories"
        :selected="selectedCategory"
        @select="selectedCategory = $event"
      />

      <!-- 商品グリッド -->
      <div class="p-4 grid grid-cols-2 gap-3">
        <MenuItemCard
          v-for="item in currentItems"
          :key="item.itemId"
          :item="item"
        />
      </div>
    </template>

    <!-- カートフッター（カートに1件以上あるとき表示） -->
    <div
      v-if="totalCount > 0"
      class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200"
    >
      <button
        @click="$router.push('/order/cart')"
        class="w-full bg-green-500 text-white py-3 rounded-xl font-bold flex justify-between items-center px-5"
      >
        <span class="bg-white text-green-600 rounded-full w-6 h-6 text-sm flex items-center justify-center font-bold">
          {{ totalCount }}
        </span>
        <span>カートを見る</span>
        <span>¥{{ totalPrice.toLocaleString() }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../../constants'
import { useCart } from '../../composables/useCart'
import CategoryTabs from '../../components/order/CategoryTabs.vue'
import MenuItemCard from '../../components/order/MenuItemCard.vue'
import type { MenuCategory } from '../../types/order'

const categories      = ref<MenuCategory[]>([])
const selectedCategory = ref('')
const isLoading       = ref(true)
const errorMessage    = ref('')

const { totalCount, totalPrice } = useCart()

// 現在選択中のカテゴリの商品一覧
const currentItems = computed(() =>
  categories.value.find(c => c.categoryId === selectedCategory.value)?.items ?? []
)

onMounted(async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/menu`)
    categories.value = res.data.categories
    if (categories.value.length > 0) {
      selectedCategory.value = categories.value[0].categoryId
    }
  } catch {
    errorMessage.value = 'メニューの読み込みに失敗しました'
  } finally {
    isLoading.value = false
  }
})
</script>
