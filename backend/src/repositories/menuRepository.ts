// メニューテーブルの DynamoDB 操作
//
// 責務: DynamoDB への読み書きのみ。ビジネスロジックは書かない。

import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../clients/dynamodb'

const TABLE_NAME = process.env.MENU_TABLE_NAME ?? 'menu-items'

// メニュー商品を表す型
export interface MenuItemRecord {
  PK: string       // "CATEGORY#coffee" など
  SK: string       // "ITEM#001" など
  name: string
  price: number
  description: string
  imageUrl: string
  available: boolean
  options: MenuOption[]
}

export interface MenuOption {
  label: string        // "サイズ"
  choices: string[]    // ["S", "M", "L"]
  extraPrice: number[] // [0, 50, 100]
}

// 全メニューを取得（データ量が少ないため Scan で許容）
export const scanAllMenuItems = async (): Promise<MenuItemRecord[]> => {
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAME })
  )
  return (result.Items ?? []) as MenuItemRecord[]
}

// メニュー商品を登録（シードスクリプトから使用）
export const putMenuItem = async (item: MenuItemRecord): Promise<void> => {
  await docClient.send(
    new PutCommand({ TableName: TABLE_NAME, Item: item })
  )
}
