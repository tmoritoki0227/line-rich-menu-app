<script setup lang="ts">
/**
 * 家計簿入力フォームコンポーネント（View 層）
 *
 * 責務: フォームの表示と入力値の管理のみ。
 * API 呼び出しは useTransaction コンポーザブルに委譲する。
 * liffContext を prop として受け取ることで、認証の詳細を知らずに済む。
 */
import { ref } from 'vue'
import type { LiffContext } from '../types'
import { getTodayJST } from '../utils/date'
import { useTransaction } from '../composables/useTransaction'

// defineProps: 親コンポーネント（App.vue）から受け取る値を宣言する
// liffContext が null でない状態のとき（v-else-if="liffContext"）にのみ表示されるため
// 型は非 null の LiffContext で宣言できる
const props = defineProps<{
  liffContext: LiffContext
}>()

// フォームの入力値
const date = ref(getTodayJST())
const amount = ref(1000)
const item = ref('昼飯')

// ゲッター関数を渡して useTransaction と疎結合に接続する
const { isSaving, save } = useTransaction(() => props.liffContext)

async function handleSave() {
  await save({ date: date.value, amount: amount.value, item: item.value })
}
</script>

<template>
  <div class="bg-white rounded-xl shadow p-5">
    <h3 class="text-lg font-bold text-gray-800 mb-4">💰 家計簿記録</h3>

    <label class="block text-sm text-gray-600 mb-1">日付</label>
    <input v-model="date" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

    <label class="block text-sm text-gray-600 mb-1">金額</label>
    <input
      v-model.number="amount"
      type="number"
      inputmode="numeric"
      class="w-full border rounded-lg px-3 py-2 mb-3"
    />

    <label class="block text-sm text-gray-600 mb-1">品物</label>
    <input v-model="item" type="text" class="w-full border rounded-lg px-3 py-2 mb-4" />

    <button
      @click="handleSave"
      :disabled="isSaving"
      class="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
    >
      {{ isSaving ? '送信中...' : '保存する' }}
    </button>
  </div>
</template>
