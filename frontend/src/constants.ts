// ============================================================
// アプリ全体で使う定数をこのファイルで一元管理する
// 値を変更するときはここだけ直せばOK
// ============================================================

// LIFF ID
// LINE Developers コンソール > LIFF-v3チャネル > LIFFタブ で発行される
// 形式: "数字-英数字"（例: "2009627798-VOeFmL56"）

// 家計簿用 LIFF ID
export const LIFF_ID = '2009633869-1vMxfCBb'

// モバイルオーダー用 LIFF ID
export const ORDER_LIFF_ID = '2009633869-aOYeSJTB'

// API Gateway のエンドポイント URL
// 記事③で Lambda + API Gateway を作成した後に差し替える
// 末尾のスラッシュは不要
// 例: "https://xxxx.execute-api.ap-northeast-1.amazonaws.com/dev"
export const API_BASE_URL = 'https://yoyj5iqrl0.execute-api.ap-northeast-1.amazonaws.com/dev'