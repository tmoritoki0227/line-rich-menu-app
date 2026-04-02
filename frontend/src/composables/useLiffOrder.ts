// モバイルオーダー用の LIFF 初期化
//
// menuPage が開いた瞬間に init して userId / userName を取得する。
// モジュールスコープに置くことでカート・確認画面など全ページで共有できる。

import { ref } from 'vue'
import liff from '@line/liff'
import { ORDER_LIFF_ID } from '../constants'

// 全ページで共有するユーザー情報
const userId   = ref('guest')
const userName = ref('ゲスト')
const isReady  = ref(false)   // init 完了フラグ

export const useLiffOrder = () => {
  // MenuPage の onMounted から呼ぶ。1回だけ実行すれば OK。
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
      // ブラウザ直接アクセス時はゲストのまま
    } finally {
      isReady.value = true
    }
  }

  return { userId, userName, isReady, initLiff }
}
