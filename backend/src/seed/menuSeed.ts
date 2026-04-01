// メニューの初期データを DynamoDB に投入するスクリプト
//
// 実行方法（backend/ フォルダで）:
//   npx ts-node src/seed/menuSeed.ts
//
// 前提: AWS 認証情報が設定済みであること（aws configure 済み or 環境変数）

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const client    = new DynamoDBClient({ region: 'ap-northeast-1' })
const docClient = DynamoDBDocumentClient.from(client)
const TABLE     = process.env.MENU_TABLE_NAME ?? 'menu-items'

const menuData = [
  // --- コーヒー ---
  {
    PK: 'CATEGORY#coffee',
    SK: 'ITEM#001',
    name: 'アメリカーノ',
    price: 350,
    description: 'すっきりとした味わいのブラックコーヒー',
    imageUrl: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=400',
    available: true,
    options: [
      { label: 'サイズ', choices: ['S', 'M', 'L'], extraPrice: [0, 50, 100] },
      { label: '温度',   choices: ['ホット', 'アイス'], extraPrice: [0, 0] },
    ],
  },
  {
    PK: 'CATEGORY#coffee',
    SK: 'ITEM#002',
    name: 'カフェラテ',
    price: 420,
    description: 'まろやかなミルクとエスプレッソの組み合わせ',
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400',
    available: true,
    options: [
      { label: 'サイズ', choices: ['S', 'M', 'L'], extraPrice: [0, 50, 100] },
      { label: '温度',   choices: ['ホット', 'アイス'], extraPrice: [0, 0] },
    ],
  },
  {
    PK: 'CATEGORY#coffee',
    SK: 'ITEM#003',
    name: 'カプチーノ',
    price: 400,
    description: '泡立てたミルクが絶品のイタリア発祥コーヒー',
    imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400',
    available: true,
    options: [
      { label: 'サイズ', choices: ['S', 'M'], extraPrice: [0, 50] },
    ],
  },
  {
    PK: 'CATEGORY#coffee',
    SK: 'ITEM#004',
    name: '抹茶ラテ',
    price: 450,
    description: '宇治抹茶を使用した本格抹茶ラテ',
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400',
    available: true,
    options: [
      { label: 'サイズ', choices: ['S', 'M', 'L'], extraPrice: [0, 50, 100] },
      { label: '温度',   choices: ['ホット', 'アイス'], extraPrice: [0, 0] },
      { label: '甘さ',   choices: ['普通', '少なめ', 'なし'], extraPrice: [0, 0, 0] },
    ],
  },

  // --- ドリンク ---
  {
    PK: 'CATEGORY#drink',
    SK: 'ITEM#101',
    name: 'オレンジジュース',
    price: 300,
    description: '搾りたてフレッシュオレンジ',
    imageUrl: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400',
    available: true,
    options: [],
  },
  {
    PK: 'CATEGORY#drink',
    SK: 'ITEM#102',
    name: 'ミネラルウォーター',
    price: 150,
    description: '天然水',
    imageUrl: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400',
    available: true,
    options: [],
  },

  // --- フード ---
  {
    PK: 'CATEGORY#food',
    SK: 'ITEM#201',
    name: 'クロワッサン',
    price: 280,
    description: 'サクサクのバター風味クロワッサン',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400',
    available: true,
    options: [],
  },
  {
    PK: 'CATEGORY#food',
    SK: 'ITEM#202',
    name: 'チーズケーキ',
    price: 380,
    description: 'なめらかでコクのあるニューヨークスタイル',
    imageUrl: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400',
    available: true,
    options: [],
  },
]

const seed = async () => {
  console.log(`テーブル: ${TABLE}`)
  console.log(`${menuData.length} 件を投入します...`)

  for (const item of menuData) {
    await docClient.send(new PutCommand({ TableName: TABLE, Item: item }))
    console.log(`  ✅ ${item.name}`)
  }

  console.log('完了！')
}

seed().catch(err => {
  console.error('エラー:', err)
  process.exit(1)
})
