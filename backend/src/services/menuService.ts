// メニューのビジネスロジック
//
// 責務: カテゴリ別にグループ化するなどの加工処理。DynamoDB 操作は repository に任せる。

import { scanAllMenuItems, MenuItemRecord, MenuOption } from '../repositories/menuRepository'

// フロントエンドに返すカテゴリ別メニューの型
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

// カテゴリ表示名の定義（PK の "CATEGORY#xxx" の xxx → 日本語）
const CATEGORY_LABELS: Record<string, string> = {
  coffee: 'コーヒー',
  food:   'フード',
  drink:  'ドリンク',
}

// カテゴリの表示順
const CATEGORY_ORDER = ['coffee', 'drink', 'food']

// 全メニューをカテゴリ別にグループ化して返す
export const getMenuGroupedByCategory = async (): Promise<MenuCategory[]> => {
  const records = await scanAllMenuItems()

  // カテゴリごとにまとめる
  const map = new Map<string, MenuItem[]>()

  for (const record of records) {
    const categoryId = record.PK.replace('CATEGORY#', '')
    const itemId     = record.SK.replace('ITEM#', '')

    if (!map.has(categoryId)) map.set(categoryId, [])

    map.get(categoryId)!.push({
      itemId,
      name:        record.name,
      price:       record.price,
      description: record.description,
      imageUrl:    record.imageUrl,
      available:   record.available,
      options:     record.options ?? [],
    })
  }

  // 表示順に並べて返す
  const categories: MenuCategory[] = []
  for (const categoryId of CATEGORY_ORDER) {
    if (map.has(categoryId)) {
      categories.push({
        categoryId,
        label: CATEGORY_LABELS[categoryId] ?? categoryId,
        items: map.get(categoryId)!,
      })
    }
  }

  // CATEGORY_ORDER に含まれないカテゴリも末尾に追加
  for (const [categoryId, items] of map.entries()) {
    if (!CATEGORY_ORDER.includes(categoryId)) {
      categories.push({
        categoryId,
        label: CATEGORY_LABELS[categoryId] ?? categoryId,
        items,
      })
    }
  }

  return categories
}
