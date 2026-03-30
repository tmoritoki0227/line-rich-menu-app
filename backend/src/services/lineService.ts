// LINE Webhook のビジネスロジックを担当する（Service 層）
//
// この層の責務: Webhook イベントの処理フロー（署名検証・キーワード判定・返信内容の決定）。
// HTTP の詳細は知らない。LINE API の呼び出しは clients/lineClient に委譲する。

import * as crypto from 'crypto'
import type { LineWebhookBody, LineEvent } from '../types'
import { replyToLine, replyFlexToLine } from '../clients/lineClient'
import { calcMonthlyTotal, listRecentHistory } from './transactionService'

/**
 * LINE Webhook の署名を検証する
 *
 * LINE サーバーはリクエストの正当性を証明するために
 * チャネルシークレットで HMAC-SHA256 署名を計算してヘッダーに付ける。
 * 一致しない場合は LINE サーバー以外からの不正リクエストとして弾く。
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET ?? ''
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64')
  return hash === signature
}

/**
 * Webhook ボディ内の全イベントを並列処理する
 */
export async function processEvents(body: string): Promise<void> {
  const { events }: LineWebhookBody = JSON.parse(body)
  // Promise.all で並列実行して処理時間を短縮する
  await Promise.all(events.map(event => processLineEvent(event)))
}

/**
 * LINE イベント 1 件を処理する（テキストメッセージのキーワード判定）
 */
async function processLineEvent(event: LineEvent): Promise<void> {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message?.type !== 'text') return

  const text = (event.message.text ?? '').trim()

  // LIFF アプリからの通知メッセージ（liff.sendMessages で送られる）は無視する
  if (text.startsWith('💰 家計簿記録完了！')) return

  const userId = event.source.userId ?? ''
  const replyToken = event.replyToken

  if (text === '合計' || text === 'summary') {
    const total = await calcMonthlyTotal(userId)
    const now = new Date()
    const yearMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`
    await replyToLine(replyToken, `📊 ${yearMonth}の合計: ${total.toLocaleString()}円`)

  } else if (text === '最新の履歴を表示') {
    const items = await listRecentHistory(userId, 5)
    if (items.length === 0) {
      await replyToLine(replyToken, '📋 まだ記録がありません。\nLIFF フォームから入力してください。')
    } else {
      const lines = items.map(i => `${i.date} ${i.time}  ${i.item}  ${i.amount.toLocaleString()}円`)
      await replyToLine(replyToken, `📋 最新${items.length}件の履歴:\n${lines.join('\n')}`)
    }

  } else if (text === 'ヘルプ') {
    const flexContents = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '操作メニュー', weight: 'bold', size: 'lg', margin: 'md' },
          { type: 'text', text: '以下から操作を選んでください', size: 'sm', color: '#888888', margin: 'sm' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#4CAF50',
                action: { type: 'message', label: '📊 今月の合計を見る', text: '合計' },
              },
              {
                type: 'button',
                style: 'primary',
                color: '#2196F3',
                action: { type: 'message', label: '📋 最新の履歴を見る', text: '最新の履歴を表示' },
              },
              {
                type: 'button',
                style: 'secondary',
                action: { type: 'message', label: '❓ ヘルプを表示', text: 'ヘルプ' },
              },
            ],
          },
        ],
      },
    }
    await replyFlexToLine(replyToken, '操作メニュー', flexContents)

  } else if (text === '機能2') {
    await replyToLine(replyToken, '🚧 この機能は現在準備中です。\nしばらくお待ちください。')

  } else {
    await replyToLine(
      replyToken,
      '使い方がわかりません。\n「ヘルプ」と送ると操作メニューを表示します。'
    )
  }
}
