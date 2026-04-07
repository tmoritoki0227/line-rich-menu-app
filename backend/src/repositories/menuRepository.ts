// メニューテーブル（menu-items）の DynamoDB 操作（Repository 層）
//
// 責務: DynamoDB への読み書きのみ。ビジネスロジックは書かない。
// テーブル構造: PK = "CATEGORY#xxx"、SK = "ITEM#yyy"

import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../clients/dynamodb'

const TABLE_NAME = process.env.MENU_TABLE_NAME ?? 'menu-items'

/** メニューオプション（サイズ・温度など選択肢を持つ付加項目） */
export interface MenuOption {
  label: string        // オプション名（例: "サイズ"）
  choices: string[]    // 選択肢（例: ["S", "M", "L"]）
  extraPrice: number[] // 各選択肢の追加料金（例: [0, 50, 100]）
}

/** DynamoDB に保存するメニュー商品レコードの型 */
export interface MenuItemRecord {
  PK: string           // "CATEGORY#coffee" など
  SK: string           // "ITEM#001" など
  name: string         // 商品名
  price: number        // 基本価格（円）
  description: string  // 商品説明
  imageUrl: string     // 商品画像の URL
  available: boolean   // false の場合は売り切れなどで注文不可
  options: MenuOption[] // 選択可能なオプション一覧
}

/**
 * 全メニュー商品を取得する
 *
 * データ量が少ないため Scan を使用。
 * 商品数が増えた場合は Query + GSI への移行を検討すること。
 */
export const scanAllMenuItems = async (): Promise<MenuItemRecord[]> => {
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAME })
  )
  return (result.Items ?? []) as MenuItemRecord[]
}

/**
 * メニュー商品を 1 件登録する（シードスクリプトから使用）
 *
 * @param item - 登録するメニュー商品レコード
 */
export const putMenuItem = async (item: MenuItemRecord): Promise<void> => {
  await docClient.send(
    new PutCommand({ TableName: TABLE_NAME, Item: item })
  )
}
