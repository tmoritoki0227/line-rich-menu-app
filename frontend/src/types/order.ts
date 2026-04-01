// モバイルオーダー機能で使う型定義

export interface MenuOption {
  label: string
  choices: string[]
  extraPrice: number[]
}

export interface MenuItem {
  itemId: string
  name: string
  price: number
  description: string
  imageUrl: string
  available: boolean
  options: MenuOption[]
}

export interface MenuCategory {
  categoryId: string
  label: string
  items: MenuItem[]
}

export interface OrderItem {
  itemId: string
  name: string
  price: number
  quantity: number
  selectedOptions: Record<string, string>
}

export type OrderStatus = 'pending' | 'ready' | 'done'

export interface OrderRecord {
  orderId: string
  orderNumber: number
  status: OrderStatus
  userId: string
  userName: string
  items: OrderItem[]
  totalPrice: number
  createdAt: string
}
