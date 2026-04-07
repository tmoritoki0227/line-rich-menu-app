// プロジェクト全体で共有する型定義
// handler / service / repository をまたいで使う型はここに集約する

// -------------------------------------------------------
// LINE Webhook 関連
// -------------------------------------------------------

/** LINE サーバーから送られてくる Webhook ボディ */
export interface LineWebhookBody {
  events: LineEvent[]  // Webhook に含まれるイベントの配列（通常は 1 件だが複数の場合もある）
}

/** LINE イベント 1 件分（必要最低限の定義） */
export interface LineEvent {
  type: string          // イベント種別（"message" / "follow" / "unfollow" など）
  replyToken: string    // 返信用トークン（特定のイベントに応答するのに使う）
  source: {
    userId?: string     // メッセージを送ったユーザーの LINE ID
    groupId?: string    // グループトークの場合のグループ ID
    type: string        // ソース種別（"user" / "group" / "room"）
  }
  message?: {
    type: string        // メッセージ種別（"text" / "image" など）
    text?: string       // テキストメッセージの場合の本文
  }
}

// -------------------------------------------------------
// 家計簿データ
// -------------------------------------------------------

/** DynamoDB に保存する家計簿レコードの型 */
export interface Transaction {
  userId: string         // PK（パーティションキー）— LINE ユーザー ID
  id: string             // SK（ソートキー）— UUID
  date: string           // 日付（"YYYY-MM-DD"）
  amount: number         // 金額（円）
  item: string           // 品物名（例: "昼飯"）
  groupId?: string | null  // グループトークの ID（個人トークの場合は null）
  createdAt: string      // 登録日時（ISO 文字列）
}

/** 履歴表示用に整形した 1 件分のデータ */
export interface HistoryItem {
  date: string      // 日付（"YYYY-MM-DD"）
  time: string      // 登録時刻（"HH:MM"、JST）
  item: string      // 品物名
  amount: number    // 金額（円）
  createdAt: string // ソート用 ISO 文字列
}
