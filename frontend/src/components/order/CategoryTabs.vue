<template>
  <!-- カテゴリ切り替えタブ -->
  <div class="flex overflow-x-auto border-b border-gray-200 bg-white sticky top-0 z-10">
    <button
      v-for="cat in categories"
      :key="cat.categoryId"
      @click="$emit('select', cat.categoryId)"
      :class="[
        'flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
        selected === cat.categoryId
          ? 'border-green-500 text-green-600'
          : 'border-transparent text-gray-500'
      ]"
    >
      {{ cat.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MenuCategory } from '../../types/order'

defineProps<{
  categories: MenuCategory[]
  selected: string
}>()

defineEmits<{
  select: [categoryId: string]
}>()
</script>
