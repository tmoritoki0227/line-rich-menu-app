// ============================================================
// アプリ全体で使う定数をこのファイルで一元管理する
// 値を変更するときはここだけ直せばOK
// ============================================================

// LIFF ID
// LINE Developers コンソール > LIFF-v3チャネル > LIFFタブ で発行される
// 形式: "数字-英数字"（例: "2009627798-VOeFmL56"）
// v3
// export const LIFF_ID = '2009627798-VOeFmL56'

//v4
export const LIFF_ID = '2009633869-1vMxfCBb'

// API Gateway のエンドポイント URL
// 記事③で Lambda + API Gateway を作成した後に差し替える
// 末尾のスラッシュは不要
// 例: "https://xxxx.execute-api.ap-northeast-1.amazonaws.com/dev"

// v3
// export const API_BASE_URL = 'https://guaj20beh1.execute-api.ap-northeast-1.amazonaws.com/dev'
// v4
export const API_BASE_URL = 'https://y48utmmau0.execute-api.ap-northeast-1.amazonaws.com/dev'