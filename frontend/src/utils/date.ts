// 日付ユーティリティ
//
// JST（日本時間）の日付計算はフロントエンド各所で必要になるため共通化する。
// Vue / LIFF に依存しない純粋な関数なので、テストがしやすい。

/**
 * 日本時間（JST）で今日の日付を "YYYY-MM-DD" 形式で返す
 *
 * new Date() はブラウザのローカル時間を返すが、
 * Lambda（UTC）との時刻ズレを防ぐため明示的に JST へ変換する
 */
export function getTodayJST(): string {
  const now = new Date()
  // UTC の時刻に 9時間（= 9 * 60分 * 60秒 * 1000ミリ秒）を足して JST にする
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // "2024-03-28T12:00:00.000Z" → "2024-03-28" の部分だけ取り出す
  return jst.toISOString().split('T')[0]
}

/**
 * 日本時間（JST）で当月1日の日付を "YYYY-MM-DD" 形式で返す
 * 集計の開始日初期値として使う
 */
export function getFirstDayOfMonthJST(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // UTC メソッドを使って JST の年・月を取得する
  const year = jst.getUTCFullYear()
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0') // 1桁の月を "01" 形式にする
  return `${year}-${month}-01`
}
