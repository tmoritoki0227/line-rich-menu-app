// LIFF の初期化とユーザー情報の取得を担当するコンポーザブル
//
// コンポーザブル（composable）とは Vue 3 の Composition API を使ったロジックの再利用単位。
// "use〇〇" という命名規則で、コンポーネントから切り離した状態管理・副作用を持てる。
// この関数を呼び出すだけで LIFF 初期化ロジックを任意のコンポーネントで使い回せる。

import { ref, onMounted } from 'vue'
import liff from '@line/liff'
import type { LiffContext } from '../types'
import { LIFF_ID } from '../constants'

export function useLiff() {
  const isLoading = ref(true)               // true の間「読み込み中...」を表示
  const liffContext = ref<LiffContext | null>(null) // LINE ユーザーの情報（初期値は null）
  const errorMessage = ref('')              // エラーメッセージ（空文字のときは表示しない）

  // onMounted: コンポーネントが画面に表示された直後に 1 回だけ実行される
  onMounted(async () => {
    try {
      // LIFF の初期化（必ず最初に呼ぶ必要がある）
      await liff.init({ liffId: LIFF_ID })

      // LINE アプリ経由でなくブラウザで直接開いた場合はログイン画面にリダイレクト
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      // ログイン済みの場合は LINE ユーザー情報を取得
      const profile = await liff.getProfile()
      const context = liff.getContext()

      liffContext.value = {
        userId: profile.userId,
        groupId: context?.groupId ?? undefined,
        roomId: context?.roomId ?? undefined,
      }
    } catch (err) {
      errorMessage.value = `初期化エラー: ${(err as Error).message}`
    } finally {
      // 成功・失敗に関わらず必ずローディングを終了する
      isLoading.value = false
    }
  })

  return { isLoading, liffContext, errorMessage }
}
