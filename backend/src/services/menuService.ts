// メニューのビジネスロジック（Service 層）
//
// 責務: DynamoDB から取得した生データをカテゴリ別に加工する。
// DynamoDB 操作は repositories/menuRepository に委譲する。

import { scanAllMenuItems, MenuItemRecord, MenuOption } from '../repositories/menuRepository'

/** フロントエンドに返すメニュー商品の型 */
export interface MenuItem {
  itemId: string       // 商品 ID
  name: string         // 商品名
  price: number        // 基本価格（円）
  description: string  // 商品説明
  imageUrl: string     // 商品画像の URL
  available: boolean   // false の場合は売り切れなどで注文不可
  options: MenuOption[] // 選択可能なオプション一覧
}

/** フロントエンドに返すカテゴリ別メニューの型 */
export interface MenuCategory {
  categoryId: string  // カテゴリ ID（例: "coffee"）
  label: string       // 表示名（例: "コーヒー"）
  items: MenuItem[]   // そのカテゴリに属する商品一覧
}

/** カテゴリ ID → 表示名のマッピング */
const CATEGORY_LABELS: Record<string, string> = {
  coffee: 'コーヒー',
  food:   'フード',
  drink:  'ドリンク',
}

/** カテゴリの表示順（ここに含まれないカテゴリは末尾に追加される） */
const CATEGORY_ORDER = ['coffee', 'drink', 'food']

/**
 * 全メニューをカテゴリ別にグループ化して返す
 *
 * DynamoDB の PK "CATEGORY#xxx" / SK "ITEM#yyy" 形式のレコードを
 * フロントエンドが扱いやすい配列形式に変換する。
 */
export const getMenuGroupedByCategory = async (): Promise<MenuCategory[]> => {
  const records = await scanAllMenuItems()

  // カテゴリ ID をキーに商品をグループ化する
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

  // CATEGORY_ORDER に従って並べ替える
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

  // CATEGORY_ORDER に含まれないカテゴリは末尾に追加する
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
