<script setup lang="ts">
/**
 * ルートコンポーネント（App.vue）
 *
 * リファクタリング後の役割: ロジックを持たない「薄い」コンポーネント。
 * - LIFF 初期化の状態を useLiff から受け取る
 * - ローディング / エラー / メイン画面の切り替えのみを担当
 * - 実際の UI は TransactionForm / SummaryCard コンポーネントに委譲
 */
import { useLiff } from './composables/useLiff'
import TransactionForm from './components/TransactionForm.vue'
import SummaryCard from './components/SummaryCard.vue'

const { isLoading, liffContext, errorMessage } = useLiff()
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-4">

    <!-- ローディング: isLoading が true の間だけ表示 -->
    <div v-if="isLoading" class="flex items-center justify-center h-screen">
      <p class="text-gray-500">読み込み中...</p>
    </div>

    <!-- エラー表示: errorMessage に文字列がある場合に表示 -->
    <div v-else-if="errorMessage" class="bg-red-100 text-red-700 p-4 rounded-lg">
      {{ errorMessage }}
    </div>

    <!-- メイン画面: LIFF 初期化完了かつエラーなし -->
    <!-- liffContext が null でないことを確認してから子コンポーネントに渡す -->
    <div v-else-if="liffContext" class="max-w-md mx-auto space-y-4">
      <TransactionForm :liffContext="liffContext" />
      <SummaryCard :liffContext="liffContext" />
    </div>

  </div>
</template>
