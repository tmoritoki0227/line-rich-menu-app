// LINE Messaging API の呼び出しを一元管理する
//
// 旧実装では replyToLine / replyFlexToLine が webhook.ts にベタ書きされていた。
// ここに集約することで LINE API の変更（エンドポイント・認証方式など）を
// 1 か所だけ修正すれば対応できるようになる。

/**
 * LINE トークルームにテキストメッセージをリプライする
 */
export async function replyToLine(replyToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

/**
 * LINE トークルームに Flex Message（カード形式）をリプライする
 *
 * @param altText - LINE 通知や Flex 非対応環境で表示される代替テキスト
 * @param contents - Flex Message のボディ定義（LINE Flex Message Simulator で作成可能）
 */
export async function replyFlexToLine(
  replyToken: string,
  altText: string,
  contents: object
): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'flex', altText, contents }],
    }),
  })
}
