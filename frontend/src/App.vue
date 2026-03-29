
<script setup lang="ts">
/**
 * <script setup lang="ts"> とは
 * - "setup" を付けると defineComponent() などの定型文が不要になる Vue 3 の記法
 * - "lang="ts"" で TypeScript を使うことを宣言する
 */

import { ref, onMounted } from 'vue'
// ref       : リアクティブな変数を作る関数。値が変わると画面が自動更新される
// onMounted : コンポーネントが画面に表示された直後に1回だけ実行する処理を登録する

import liff from '@line/liff'
// LINE Front-end Framework SDK
// LINE ユーザー情報の取得・メッセージ送信・ウィンドウ操作などに使う

import axios from 'axios'
// HTTP クライアント。バックエンドの API を呼び出すために使う

import type { LiffContext } from './types'
// "import type" は TypeScript の型情報だけをインポートする（実行時には消える）

import { LIFF_ID, API_BASE_URL } from './constants'

// ============================================================
// 状態管理
// ref() で定義した変数が画面の表示を制御する
// 変数名.value で値を読み書きする（テンプレート内では .value 不要）
// ============================================================
const isLoading = ref(true)               // true の間「読み込み中...」を表示
const isSaving = ref(false)               // true の間「送信中...」を表示してボタンを無効化
const isSummaryLoading = ref(false)       // true の間「集計中...」を表示
const liffContext = ref<LiffContext | null>(null) // LINE ユーザーの情報（初期値は null）
const errorMessage = ref('')              // エラーメッセージ（空文字のときは表示しない）
const summaryTotal = ref<number | null>(null) // 集計結果（null = 未集計）

// ============================================================
// フォームの入力値
// v-model でテンプレートの <input> と双方向に同期する
// ============================================================
const date = ref(getTodayJST())  // 日付（初期値: 今日の日付）
const amount = ref(1000)         // 金額（初期値: 1000円）
const item = ref('昼飯')         // 品物名（初期値: 昼飯）

// 集計期間の入力値（初期値: 当月1日〜今日）
const summaryStartDate = ref(getFirstDayOfMonthJST())
const summaryEndDate = ref(getTodayJST())

/**
 * 日本時間（JST）で今日の日付を "YYYY-MM-DD" 形式で返す
 *
 * new Date() はブラウザのローカル時間を返すが、
 * Lambda（UTC）との時刻ズレを防ぐため明示的に JST へ変換する
 */
function getTodayJST(): string {
  const now = new Date()
  // UTC の時刻に 9時間（= 9 * 60分 * 60秒 * 1000ミリ秒）を足して JST にする
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // "2024-03-28T12:00:00.000Z" → "2024-03-28" の部分だけ取り出す
  return jst.toISOString().split('T')[0]
}

/**
 * 日本時間（JST）で当月1日の日付を "YYYY-MM-DD" 形式で返す
 * 集計の開始日初期値として使う
 */
function getFirstDayOfMonthJST(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // UTC メソッドを使って JST の年・月を取得する
  const year = jst.getUTCFullYear()
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0') // 1桁の月を "01" 形式にする
  return `${year}-${month}-01`
}

/**
 * LIFF 初期化
 * onMounted でコンポーネント表示直後に実行する
 * ① LIFF を初期化 → ② 未ログインならリダイレクト → ③ ユーザー情報取得
 */
onMounted(async () => {
  try {
    // LIFF の初期化（必ず最初に呼ぶ必要がある）
    await liff.init({ liffId: LIFF_ID })

    // LINE アプリ経由でなくブラウザで直接開いた場合はログイン画面にリダイレクト
    if (!liff.isLoggedIn()) {
      liff.login()
      return // login() はリダイレクトするのでここで処理を止める
    }

    // ログイン済みの場合は LINE ユーザー情報を取得
    const profile = await liff.getProfile() // userId, displayName など
    const context = liff.getContext()       // グループID、ルームID など

    liffContext.value = {
      userId: profile.userId,
      // "??" は null / undefined のときだけ右辺を返す「null 合体演算子」
      groupId: context?.groupId ?? undefined,
      roomId: context?.roomId ?? undefined,
    }
  } catch (err) {
    // 初期化に失敗した場合はエラーメッセージを画面に表示する
    errorMessage.value = `初期化エラー: ${(err as Error).message}`
  } finally {
    // 成功・失敗に関わらず必ずローディングを終了する
    isLoading.value = false
  }
})

/**
 * 保存処理
 * ① LINE トークルームにメッセージを送信
 * ② バックエンド API に保存（DynamoDB に書き込まれる）
 */
async function save() {
  // バリデーション: 金額が空の場合はアラートを出して処理を中断
  if (!amount.value) {
    alert('金額を入力してください')
    return
  }
  // liffContext が null の場合（初期化失敗）は何もしない
  if (!liffContext.value) return

  isSaving.value = true // ボタンを「送信中...」に変えて二重送信を防ぐ
  try {
    // ① LINE のトークルームにメッセージを送信
    //    liff.sendMessages() は LIFF アプリを開いたトークルームに送れる
    await liff.sendMessages([
      {
        type: 'text',
        text: `💰 家計簿記録完了！\n日付: ${date.value}\n金額: ${amount.value}円\n品物: ${item.value}`,
      },
    ])

    // ② バックエンド API にデータを保存（Lambda が DynamoDB 保存 + Slack 通知を行う）
    await axios.post(`${API_BASE_URL}/transaction`, {
      userId: liffContext.value.userId,
      groupId: liffContext.value.groupId,
      date: date.value,
      amount: amount.value,
      item: item.value,
    })

    // ③ 保存完了を通知（画面はそのまま保持）
    alert('保存しました！！')
  } catch (err) {
    alert(`エラーが発生しました: ${(err as Error).message}`)
  } finally {
    isSaving.value = false // 成功・失敗に関わらずボタンを元に戻す
  }
}

/**
 * 期間集計処理
 * GET /summary?userId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 指定期間内の支出合計を取得して summaryTotal に格納する
 */
async function fetchSummary() {
  if (!liffContext.value) return
  if (!summaryStartDate.value || !summaryEndDate.value) {
    alert('集計期間を入力してください')
    return
  }

  isSummaryLoading.value = true
  summaryTotal.value = null // 前回の結果をリセット
  try {
    // GET /summary?userId=xxx&startDate=xxx&endDate=xxx を呼び出す
    const res = await axios.get<{ total: number }>(`${API_BASE_URL}/summary`, {
      params: {
        userId: liffContext.value.userId,
        startDate: summaryStartDate.value,
        endDate: summaryEndDate.value,
      },
    })
    summaryTotal.value = res.data.total // 取得した合計金額を格納
  } catch (err) {
    alert(`集計エラー: ${(err as Error).message}`)
  } finally {
    isSummaryLoading.value = false
  }
}
</script>

<template>
  <!--
    Tailwind CSS のよく使うクラス（覚えておくと便利）
    min-h-screen  : 最小の高さをビューポート全体に設定
    bg-gray-50    : 薄いグレーの背景色
    p-4           : padding を 1rem（16px）に設定
    max-w-md      : 最大幅を 28rem（448px）に設定
    mx-auto       : 左右の margin を auto にして中央揃え
    space-y-4     : 子要素の間に縦方向のスペース（1rem）を追加
  -->
  <div class="min-h-screen bg-gray-50 p-4">

    <!-- ローディング: isLoading が true の間だけ表示 -->
    <div v-if="isLoading" class="flex items-center justify-center h-screen">
      <p class="text-gray-500">読み込み中...</p>
    </div>

    <!-- エラー表示: errorMessage に文字列がある場合に表示 -->
    <div v-else-if="errorMessage" class="bg-red-100 text-red-700 p-4 rounded-lg">
      {{ errorMessage }}
    </div>

    <!-- メイン画面: ローディング完了かつエラーなしの場合に表示 -->
    <div v-else class="max-w-md mx-auto space-y-4">

      <!-- 入力フォームカード -->
      <div class="bg-white rounded-xl shadow p-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4">💰 家計簿記録</h3>

        <label class="block text-sm text-gray-600 mb-1">日付</label>
        <!-- v-model="date" で入力値と date ref が双方向に同期する -->
        <input v-model="date" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

        <label class="block text-sm text-gray-600 mb-1">金額</label>
        <!--
          v-model.number : 入力値を自動的に数値型に変換する（.number 修飾子）
          inputmode="numeric" : スマホ表示時に数字キーボードを出す
        -->
        <input
          v-model.number="amount"
          type="number"
          inputmode="numeric"
          class="w-full border rounded-lg px-3 py-2 mb-3"
        />

        <label class="block text-sm text-gray-600 mb-1">品物</label>
        <input v-model="item" type="text" class="w-full border rounded-lg px-3 py-2 mb-4" />

        <!--
          @click="save"      : クリック時に save() を呼び出す（@は v-on: の省略形）
          :disabled="isSaving": isSaving が true の間ボタンを無効化（: は v-bind: の省略形）
        -->
        <button
          @click="save"
          :disabled="isSaving"
          class="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
        >
          <!-- isSaving の値によって表示テキストを切り替える（三項演算子） -->
          {{ isSaving ? '送信中...' : '保存する' }}
        </button>
      </div>

      <!-- 集計カード -->
      <div class="bg-white rounded-xl shadow p-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4">📊 期間集計</h3>

        <label class="block text-sm text-gray-600 mb-1">開始日</label>
        <input v-model="summaryStartDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

        <label class="block text-sm text-gray-600 mb-1">終了日</label>
        <input v-model="summaryEndDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-4" />

        <button
          @click="fetchSummary"
          :disabled="isSummaryLoading"
          class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
        >
          {{ isSummaryLoading ? '集計中...' : '集計する' }}
        </button>

        <!-- 集計結果: summaryTotal が null でないときだけ表示 -->
        <div v-if="summaryTotal !== null" class="mt-4 p-3 bg-blue-50 rounded-lg text-center">
          <p class="text-sm text-gray-600">{{ summaryStartDate }} 〜 {{ summaryEndDate }}</p>
          <!-- toLocaleString() で数値を "1,000" のように3桁区切りで表示 -->
          <p class="text-2xl font-bold text-blue-700 mt-1">{{ summaryTotal.toLocaleString() }}円</p>
        </div>
      </div>

    </div>
  </div>
</template>
