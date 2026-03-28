/**
 * 家計簿1件分のデータ型
 * DynamoDB に保存されるレコードの構造と対応している
 */
export interface Transaction {
  id: string       // 一意なID（Lambda側で uuid を自動生成）
  date: string     // 日付（例: "2024-03-28"）
  amount: number   // 金額（円）
  item: string     // 品物名（例: "昼飯"）
  userId: string   // LINE のユーザーID（liff.getProfile() から取得）
  groupId?: string // グループトークのID（個人トークの場合は undefined）
}

/**
 * LIFF から取得できるコンテキスト情報
 * liff.getContext() の戻り値から必要な部分だけを抽出した型
 */
export interface LiffContext {
  userId: string   // LINE ユーザーID
  groupId?: string // グループトークのID（グループ外から開いた場合は undefined）
  roomId?: string  // 複数人トークのID（通常は undefined）
}
