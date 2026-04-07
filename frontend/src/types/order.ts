// モバイルオーダー機能で使う型定義

/** メニューオプション（サイズ・温度など選択肢を持つ付加項目） */
export interface MenuOption {
  label: string        // オプション名（例: "サイズ"）
  choices: string[]    // 選択肢（例: ["S", "M", "L"]）
  extraPrice: number[] // 各選択肢の追加料金（例: [0, 50, 100]）
}

/** メニュー商品 1 件 */
export interface MenuItem {
  itemId: string
  name: string
  price: number        // 基本価格（円）
  description: string
  imageUrl: string
  available: boolean   // 売り切れなどで注文不可の場合は false
  options: MenuOption[]
}

/** カテゴリ別にまとめたメニュー（API レスポンスの形） */
export interface MenuCategory {
  categoryId: string
  label: string        // 表示名（例: "コーヒー"）
  items: MenuItem[]
}

/** 注文内の商品 1 行 */
export interface OrderItem {
  itemId: string
  name: string
  price: number                            // オプション込みの単価
  quantity: number
  selectedOptions: Record<string, string>  // { "サイズ": "M", "温度": "アイス" }
}

/** 注文ステータス */
export type OrderStatus = 'pending' | 'ready' | 'done'

/** 注文レコード（API レスポンス・DynamoDB 保存形式） */
export interface OrderRecord {
  orderId: string
  orderNumber: number
  status: OrderStatus
  userId: string
  userName: string
  items: OrderItem[]
  totalPrice: number
  createdAt: string   // ISO 8601
}
