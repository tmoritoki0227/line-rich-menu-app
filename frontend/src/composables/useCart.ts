// カートのロジックを担当するコンポーザブル
//
// 責務: カートへの追加・削除・数量変更・合計金額の計算。
// モジュールスコープに状態を置くことで、メニュー画面・カート画面・確認画面など
// 複数ページで同じカートを参照できる。

import { ref, computed } from 'vue'
import type { MenuItem, MenuOption } from '../types/order'

/** カート内の 1 商品 */
export interface CartItem {
  cartId: string                           // カート内のユニーク ID（同じ商品でもオプションが違う場合を区別）
  itemId: string                           // メニュー商品の ID
  name: string                             // 商品名
  basePrice: number                        // 商品の基本価格（オプション追加料金を含まない）
  unitPrice: number                        // オプション込みの単価
  quantity: number                         // 数量
  selectedOptions: Record<string, string>  // 選択されたオプション（例: { "サイズ": "M" }）
}

// カートの状態（モジュールスコープ）
const cartItems = ref<CartItem[]>([])

export const useCart = () => {
  /** 合計金額 */
  const totalPrice = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  )

  /** 合計個数 */
  const totalCount = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
  )

  /**
   * カートに商品を追加する
   *
   * 同じ itemId かつ同じオプションの組み合わせがすでにある場合は数量を増やす。
   *
   * @param menuItem        - 追加するメニュー商品
   * @param selectedOptions - 選択されたオプション（例: { "サイズ": "M" }）
   * @param quantity        - 追加する個数（デフォルト: 1）
   */
  const addToCart = (
    menuItem: MenuItem,
    selectedOptions: Record<string, string>,
    quantity = 1
  ) => {
    const extraPrice = calcExtraPrice(menuItem.options, selectedOptions)
    const unitPrice  = menuItem.price + extraPrice
    const key        = buildCartKey(menuItem.itemId, selectedOptions)
    const existing   = cartItems.value.find(i => i.cartId === key)

    if (existing) {
      existing.quantity += quantity
    } else {
      cartItems.value.push({
        cartId:          key,
        itemId:          menuItem.itemId,
        name:            menuItem.name,
        basePrice:       menuItem.price,
        unitPrice,
        quantity,
        selectedOptions,
      })
    }
  }

  /**
   * カート内の商品の数量を変更する
   *
   * quantity を 0 以下にすると商品をカートから削除する。
   *
   * @param cartId   - 変更する商品の cartId
   * @param quantity - 新しい数量
   */
  const updateQuantity = (cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartId)
      return
    }
    const item = cartItems.value.find(i => i.cartId === cartId)
    if (item) item.quantity = quantity
  }

  /**
   * カートから商品を削除する
   *
   * @param cartId - 削除する商品の cartId
   */
  const removeFromCart = (cartId: string) => {
    cartItems.value = cartItems.value.filter(i => i.cartId !== cartId)
  }

  /** カートを空にする */
  const clearCart = () => {
    cartItems.value = []
  }

  return {
    cartItems,
    totalPrice,
    totalCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  }
}

// --- ユーティリティ（モジュール内部でのみ使用） ---

/**
 * 選択されたオプションの追加料金を合計する
 *
 * @param options  - メニュー商品のオプション定義
 * @param selected - 選択されたオプション（例: { "サイズ": "M" }）
 */
const calcExtraPrice = (
  options: MenuOption[],
  selected: Record<string, string>
): number => {
  let extra = 0
  for (const option of options) {
    const chosenValue = selected[option.label]
    const idx = option.choices.indexOf(chosenValue)
    if (idx >= 0 && option.extraPrice[idx]) {
      extra += option.extraPrice[idx]
    }
  }
  return extra
}

/**
 * カート内で商品を一意に識別するキーを生成する
 *
 * 同じ商品でも選択オプションが異なる場合は別エントリとして扱う。
 *
 * @param itemId          - メニュー商品の ID
 * @param selectedOptions - 選択されたオプション
 */
const buildCartKey = (
  itemId: string,
  selectedOptions: Record<string, string>
): string => {
  const optStr = Object.entries(selectedOptions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${itemId}__${optStr}`
}
