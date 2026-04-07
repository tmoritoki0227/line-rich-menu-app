// GET /menu ハンドラ
//
// 責務: HTTP リクエストの受け取りとレスポンス返却のみ。ロジックは service に任せる。

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getMenuGroupedByCategory } from '../services/menuService'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

/**
 * GET /menu — カテゴリ別メニュー一覧を返す
 *
 * クエリパラメータなし。全カテゴリ・全商品を返す。
 * メニューデータは DynamoDB の menu-items テーブルから取得する。
 */
export const getMenu = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const categories = await getMenuGroupedByCategory()

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ categories }),
  }
}
