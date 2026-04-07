// フロントエンド共通の型定義

/** 家計簿 1 件分のデータ型（DynamoDB に保存されるレコードの構造と対応） */
export interface Transaction {
  id: string        // 一意な ID（Lambda 側で uuid を自動生成）
  date: string      // 日付（例: "2024-03-28"）
  amount: number    // 金額（円）
  item: string      // 品物名（例: "昼飯"）
  userId: string    // LINE のユーザー ID（liff.getProfile() から取得）
  groupId?: string  // グループトーク ID（個人トークの場合は undefined）
}

/** LIFF から取得できるコンテキスト情報（liff.getContext() の必要部分を抽出） */
export interface LiffContext {
  userId: string    // LINE ユーザー ID
  groupId?: string  // グループトーク ID（グループ外から開いた場合は undefined）
  roomId?: string   // 複数人トーク ID（通常は undefined）
}
