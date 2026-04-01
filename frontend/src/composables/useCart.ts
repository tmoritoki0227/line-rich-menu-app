// カートのロジック
//
// 責務: カートへの追加・削除・数量変更・合計金額の計算。
// グローバルな状態として管理し、どのページからでも同じカートを参照できる。

import { ref, computed } from 'vue'
import type { MenuItem, MenuOption } from '../types/order'

// カート内の1商品
export interface CartItem {
  cartId: string    // カート内のユニークID（同じ商品でもオプションが違う場合を区別）
  itemId: string
  name: string
  basePrice: number           // 商品の基本価格
  unitPrice: number           // オプション込みの単価
  quantity: number
  selectedOptions: Record<string, string>  // { "サイズ": "M" }
}

// カートの状態（モジュールスコープに置くことでページ間で共有される）
const cartItems = ref<CartItem[]>([])

export const useCart = () => {
  // 合計金額
  const totalPrice = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  )

  // 合計個数
  const totalCount = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
  )

  // カートに追加
  // 同じ itemId + 同じオプションの組み合わせがあれば数量を増やす
  const addToCart = (
    menuItem: MenuItem,
    selectedOptions: Record<string, string>,
    quantity = 1
  ) => {
    // オプションから追加料金を計算
    const extraPrice = calcExtraPrice(menuItem.options, selectedOptions)
    const unitPrice  = menuItem.price + extraPrice

    // 同じ商品・同じオプションを探す
    const key      = buildCartKey(menuItem.itemId, selectedOptions)
    const existing = cartItems.value.find(i => i.cartId === key)

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

  // 数量を変更（0 にすると削除）
  const updateQuantity = (cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartId)
      return
    }
    const item = cartItems.value.find(i => i.cartId === cartId)
    if (item) item.quantity = quantity
  }

  // カートから削除
  const removeFromCart = (cartId: string) => {
    cartItems.value = cartItems.value.filter(i => i.cartId !== cartId)
  }

  // カートを空にする
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

// --- ユーティリティ ---

// オプションの追加料金を合計する
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

// cartId を生成（itemId + 選択オプションの文字列）
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
