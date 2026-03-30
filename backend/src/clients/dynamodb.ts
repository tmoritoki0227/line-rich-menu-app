// DynamoDB クライアントの初期化を一元管理する
//
// 旧実装では transaction.ts と webhook.ts の両方に同じ初期化コードが重複していた。
// ここに集約することで変更箇所を 1 か所にまとめる（DRY 原則）。

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
})

// DynamoDBDocumentClient: DynamoDB の型変換（AttributeValue ↔ JS ネイティブ型）を自動処理するラッパー
export const docClient = DynamoDBDocumentClient.from(dynamoClient)

// テーブル名は環境変数から取得（SAM template.yaml の Environment で注入される）
export const TABLE_NAME = process.env.TABLE_NAME ?? 'line-bot-table-v4'
