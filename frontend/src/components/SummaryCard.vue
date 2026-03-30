<script setup lang="ts">
/**
 * 期間集計カードコンポーネント（View 層）
 *
 * 責務: 集計期間の入力と結果の表示のみ。
 * API 呼び出しは useTransaction コンポーザブルに委譲する。
 */
import { ref } from 'vue'
import type { LiffContext } from '../types'
import { getTodayJST, getFirstDayOfMonthJST } from '../utils/date'
import { useTransaction } from '../composables/useTransaction'

const props = defineProps<{
  liffContext: LiffContext
}>()

// 集計期間の入力値（初期値: 当月1日〜今日）
const summaryStartDate = ref(getFirstDayOfMonthJST())
const summaryEndDate = ref(getTodayJST())

const { isSummaryLoading, summaryTotal, fetchSummary } = useTransaction(() => props.liffContext)

async function handleFetchSummary() {
  await fetchSummary({
    startDate: summaryStartDate.value,
    endDate: summaryEndDate.value,
  })
}
</script>

<template>
  <div class="bg-white rounded-xl shadow p-5">
    <h3 class="text-lg font-bold text-gray-800 mb-4">📊 期間集計</h3>

    <label class="block text-sm text-gray-600 mb-1">開始日</label>
    <input v-model="summaryStartDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

    <label class="block text-sm text-gray-600 mb-1">終了日</label>
    <input v-model="summaryEndDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-4" />

    <button
      @click="handleFetchSummary"
      :disabled="isSummaryLoading"
      class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
    >
      {{ isSummaryLoading ? '集計中...' : '集計する' }}
    </button>

    <!-- 集計結果: summaryTotal が null でないときだけ表示 -->
    <div v-if="summaryTotal !== null" class="mt-4 p-3 bg-blue-50 rounded-lg text-center">
      <p class="text-sm text-gray-600">{{ summaryStartDate }} 〜 {{ summaryEndDate }}</p>
      <p class="text-2xl font-bold text-blue-600 mt-1">{{ summaryTotal.toLocaleString() }} 円</p>
    </div>
  </div>
</template>
