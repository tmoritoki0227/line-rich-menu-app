// モバイルオーダー用の LIFF 初期化コンポーザブル
//
// モジュールスコープに状態を置くことで、カート・確認画面など
// 複数ページで同じユーザー情報を共有できる。
// MenuPage の onMounted から initLiff() を 1 回呼べば全ページで使い回せる。

import { ref } from 'vue'
import liff from '@line/liff'
import { ORDER_LIFF_ID } from '../constants'

// 全ページで共有するユーザー情報（モジュールスコープ）
const userId   = ref('guest')
const userName = ref('ゲスト')
const isReady  = ref(false)   // LIFF init 完了フラグ

export const useLiffOrder = () => {
  /**
   * LIFF を初期化してユーザー情報を取得する
   *
   * 既に初期化済みの場合は何もしない（複数回呼んでも安全）。
   * LINE アプリ外のブラウザから開いた場合はゲストのまま続行する。
   */
  const initLiff = async () => {
    if (isReady.value) return   // 既に init 済みなら何もしない

    try {
      await liff.init({ liffId: ORDER_LIFF_ID })

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const profile  = await liff.getProfile()
      userId.value   = profile.userId
      userName.value = profile.displayName
    } catch {
      // ブラウザ直接アクセス時はゲストのまま続行する
    } finally {
      isReady.value = true
    }
  }

  return { userId, userName, isReady, initLiff }
}
