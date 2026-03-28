// ============================================================
// アプリ全体で使う定数をこのファイルで一元管理する
// 値を変更するときはここだけ直せばOK
// ============================================================

// LIFF ID
// LINE Developers コンソール > LIFF-v3チャネル > LIFFタブ で発行される
// 形式: "数字-英数字"（例: "2009627798-VOeFmL56"）
export const LIFF_ID = '2009627798-VOeFmL56'

// API Gateway のエンドポイント URL
// 記事③で Lambda + API Gateway を作成した後に差し替える
// 末尾のスラッシュは不要
// 例: "https://xxxx.execute-api.ap-northeast-1.amazonaws.com/dev"
export const API_BASE_URL = 'https://guaj20beh1.execute-api.ap-northeast-1.amazonaws.com/dev'
