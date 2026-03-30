// プロジェクト全体で共有する型定義
// handler / service / repository をまたいで使う型はここに集約する

// -------------------------------------------------------
// LINE Webhook 関連
// -------------------------------------------------------

/** LINE サーバーから送られてくる Webhook ボディ */
export interface LineWebhookBody {
  events: LineEvent[]
}

/** LINE イベント 1 件分（必要最低限の定義） */
export interface LineEvent {
  type: string
  replyToken: string
  source: {
    userId?: string
    groupId?: string
    type: string
  }
  message?: {
    type: string
    text?: string
  }
}

// -------------------------------------------------------
// 家計簿データ
// -------------------------------------------------------

/** DynamoDB に保存する家計簿レコードの型 */
export interface Transaction {
  userId: string         // PK（パーティションキー）
  id: string             // SK（ソートキー）— UUID
  date: string           // "YYYY-MM-DD"
  amount: number
  item: string
  groupId?: string | null
  createdAt: string      // ISO 文字列
}

/** 履歴表示用に整形した 1 件分のデータ */
export interface HistoryItem {
  date: string
  time: string           // "HH:MM"（JST）
  item: string
  amount: number
  createdAt: string      // ソート用 ISO 文字列
}
