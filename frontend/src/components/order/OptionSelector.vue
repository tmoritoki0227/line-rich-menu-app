<template>
  <!-- サイズ・温度などのオプション選択 -->
  <div class="space-y-3">
    <div v-for="option in options" :key="option.label">
      <p class="text-sm font-medium text-gray-700 mb-1">{{ option.label }}</p>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="(choice, idx) in option.choices"
          :key="choice"
          @click="select(option.label, choice)"
          :class="[
            'px-3 py-1 rounded-full text-sm border transition-colors',
            selected[option.label] === choice
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-white text-gray-700 border-gray-300'
          ]"
        >
          {{ choice }}
          <span v-if="option.extraPrice[idx] > 0" class="text-xs">
            (+¥{{ option.extraPrice[idx] }})
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MenuOption } from '../../types/order'

const props = defineProps<{
  options: MenuOption[]
  selected: Record<string, string>
}>()

const emit = defineEmits<{
  update: [selected: Record<string, string>]
}>()

const select = (label: string, choice: string) => {
  emit('update', { ...props.selected, [label]: choice })
}
</script>
