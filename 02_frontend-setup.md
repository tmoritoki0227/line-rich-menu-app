# 【記事②】AWS × LINE 家計簿ボットをTypeScriptで作る — ローカル環境構築 + フロントエンド実装（Vue 3 / LIFF）

> ⚠️ **この手順書について**
> この記事はシリーズの流れに沿ってリソースを手動作成する方法を解説しています。
> **コードの実装内容（VueコンポーネントやLIFF連携ロジック等）は現在も参考になります。**
> ただし以下の点は最新の構成と異なります：
> - AWSリソースのデプロイ方法（この記事はコンソール手動操作、最新はSAM一括構築）
> - CI/CDの設定内容（ワークフローの内容が更新されています）
>
> **コードをcloneして最短で動かす場合は [07_quickstart.md](./07_quickstart.md) を参照してください。**

> **シリーズ概要**: TypeScript + Vue 3 + AWS（Lambda / DynamoDB / CloudFront）+ IaC + CI/CDを使って、LINEで使える家計簿ボットをゼロから構築する。全4記事。
>
> - 記事① AWS基盤 & 認証整備（IAM Identity Center）
> - **記事②** ローカル環境構築 + フロントエンド実装（本記事）
> - 記事③ バックエンド実装（Node.js Lambda / DynamoDB）
> - 記事④ IaC・CI/CD + LINE連携 & 最終検証

---

## ステップ2：ローカル開発環境の土台作り

> **作業ディレクトリについて**: このシリーズではプロジェクト用フォルダ（例: `line-rich-menu-app`）を作成し、その中で作業を進める。以降のコマンドは特に断りがない限りこのフォルダ内で実行する。
>
> ```
> line-rich-menu-app/   ← ここが作業ディレクトリ
> ├── frontend/         ← Vue app（ステップ4で作成）
> ├── backend/          ← Lambda関数（記事③で作成）
> ├── infra/            ← CDK（記事④で作成）
> └── 0x_*.md           ← 手順書
> ```

### 2-1. 必要なツールの確認・インストール

#### Node.js / npm

Node.js v18以上が必要。以下でバージョンを確認する。

```bash
node -v   # v18.x.x 以上であればOK
npm -v
```

インストールされていない場合は [Node.js公式サイト](https://nodejs.org/ja) からLTS版をダウンロードしてインストールする。

#### VS Code

[VS Code公式サイト](https://code.visualstudio.com/) からインストール。
以下の拡張機能を入れておくと開発が快適になる。

| 拡張機能名 | 作者 | 用途 |
|---|---|---|
| Vue - Official | Vue | Vue 3の構文ハイライト・補完 |
| ESLint | Microsoft | コード品質チェック |
| Prettier - Code formatter | Prettier | コード自動整形 |

> VS Codeの拡張機能検索で上記の名前と作者が一致するものをインストールする。同名の別作者のものは非推奨や古いバージョンの場合があるため注意。

---

## ステップ3：LINE Developers の設定

### 3-1. プロバイダーとMessaging APIチャネルの作成

> ⚠️ この手順はLINEアカウントで行う。AWSの話は出てこない。

1. [LINE Developers コンソール](https://developers.line.biz/console/) にアクセスしてログイン。
2. **[作成]** をクリックし、「新規プロバイダー作成」をする。
   - 名前: **`勉強会用-v3`** を入力して作成。
3. 画面中央の **[Messaging API]** アイコンをクリック。
4. **「Messaging APIチャネルの作成」** 画面で、緑色の **[LINE公式アカウントを作成する]** ボタンをクリック。
5. **「LINE公式アカウントの作成」** 画面で以下を入力する。
   - **アカウント名**: **`初めてのLINEボット-v3`**
   - **メールアドレス**: 自分のアドレス
   - **会社・事業者の所在地・地域**: 日本
   - **業種**: 大業種「個人」、小業種「個人（IT・コンピュータ）」
   - **運用目的**: 「その他」にチェック / **主な使い方**: 「未定」
   - **ビジネスマネージャーの組織との接続方法**: **[ビジネスマネージャーの組織を作成]** にチェック
6. 一番下の **[確認]** ＞ **[完了]** をクリック。
   - 「LINEヤフー for Businessを友だち追加」のチェックは**外す**。
7. **「LINE公式アカウントが作成されました」** 画面で **[LINE Official Account Managerへ]** をクリック。
8. **「情報利用に関する同意について」** 画面で **[同意]** をクリック。
9. **「LINEヤフーグループへの情報提供に関する個別規約への同意について」** 画面で **[同意]** をクリック。
10. **「運用をはじめる前に (1/2)」** で **[次へ]**、**「まずは友だちを集めましょう (2/2)」** で **[ホーム画面に移動]** をクリック。
11. 管理画面（LINE Official Account Manager）の右上 **[設定]** ＞ 左メニュー **[Messaging API]** ＞ **[Messaging APIを利用する]** をクリック。
12. **「プロバイダーを選択」** 画面で **`勉強会用-v3`** にチェックを入れ ＞ **[同意する]** をクリック。
13. **「プライバシーポリシーと利用規約」** 画面は2つの入力欄（https://?）を**空欄**のまま **[OK]** をクリック。
14. **「Messaging APIを利用」** 案内で **[OK]** をクリック。
15. **[LINE Developersコンソール]** という青いリンクをクリックして戻る。
16. LINE Developers ＞ **`勉強会用-v3`** ＞ **`初めてのLINEボット-v3`** をクリック。

### 3-2. チャネルアクセストークンとシークレットの取得

1. **[Messaging API設定]** タブ ＞ 一番下の **[チャネルアクセストークン]** ＞ **[発行]** をクリック。
   - 表示された長い英数字をコピーして保存する。
2. **[チャネル基本設定]** タブ ＞ 画面中央の **チャネルシークレット** をコピーして保存する。

> **保存先**: この2つの値はAWS Lambdaの環境変数（`LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET`）として使う。絶対にコードにハードコードしない。

### 3-3. 応答設定の変更

1. [LINE Official Account Manager] ＞ **[設定]** ＞ **[応答設定]**。
2. **応答メッセージ**: オフ
3. **あいさつメッセージ**: オフ

> Webhookで自前の返信を制御するため、自動応答をオフにする。

### 3-4. LINEログインチャネルとLIFFアプリの作成

LIFFはLINEのチャット画面の上に表示するWebアプリの仕組み。LIFFを使うには「LINEログイン」チャネルが別途必要になる。

1. LINE Developers ＞ 画面左上のパンくずリストから **`勉強会用-v3`** をクリックして戻る。
2. **[新規チャネル作成]** ＞ 一番左の **[LINEログイン]** を選択。
3. 以下の情報を入力して作成する。
   - **会社・事業者の所在国・地域**: 日本
   - **チャネル名**: `LIFF-v3`
   - **チャネル説明**: `入力フォーム用チャネル`
   - **アプリのタイプ**: **[ウェブアプリ]** に必ずチェックを入れる
   - **2要素認証の必須化**: オフ
   - **メールアドレス**: 自分のアドレス
   - 「LINE開発者契約に同意します。」にチェック
4. **[作成]** ＞ **[同意する]**。
5. 作成した `LIFF-v3` チャネル ＞ **[LIFF]** タブ ＞ **[追加]** をクリック。
6. 以下の内容で設定する。
   - **LIFFアプリ名**: `入力フォーム-v3`
   - **サイズ**: `Full`
   - **エンドポイントURL**: `https://example.com`（※ダミーでOK。記事④でCloudFrontのURLに差し替える）
   - **Scopes**: `profile` と `chat_message.write` にチェック
   - **友だち追加オプション**: `On (Normal)`
7. 一番下の **[追加]** をクリック。
8. 発行された `https://liff.line.me/〜` のURLをコピーして保存する。

> **LIFF IDとは**: `https://liff.line.me/` の後ろの部分（例: `2009623278-XXXXXXXX`）のこと。後ほどフロントエンドのコードで使う。

> **⚠️ エンドポイントURLについて**: LIFFの登録にはURLが必須だが、この時点ではまだCloudFrontが存在しないためダミーURLで登録する。記事④のCloudFront構築後に正しいURLへ更新する手順がある。LIFF IDの取得が目的なのでこのまま進めてよい。

---

## ステップ4：Vite + Vue 3 プロジェクトの初期化

### 4-1. プロジェクト作成

ターミナルで作業ディレクトリに移動し、以下を実行する。

```bash
# line-rich-menu-app フォルダ内で実行する
npm create vite@latest frontend -- --template vue-ts
```

途中で以下のプロンプトが表示される。

```
◆  Install with npm and start now?
│  ● Yes / ○ No
```

**`No` を選択**（矢印キーで移動して Enter）してください。

> `Yes` を選ぶと自動でサーバーが起動してしまうため、`No` を選んで手動でインストールする。

続けて以下を実行する。

```bash
cd frontend
npm install
```

実行後、`frontend/` フォルダが自動的に作成される。`backend/` と `infra/` は後の記事で作成するため、今は不要。

```
line-rich-menu-app/
├── frontend/       ← ✅ 今作成された
├── backend/        ← 記事③で作成
├── infra/          ← 記事④で作成
└── 0x_*.md         ← 手順書
```

### 4-2. 依存ライブラリのインストール

```bash
# LIFFのSDK（LINE公式）
npm install @line/liff

# HTTPクライアント（API Gateway呼び出しに使用）
npm install axios

# Tailwind CSS（スタイリング）
npm install -D tailwindcss @tailwindcss/vite

# アイコンライブラリ
npm install lucide-vue-next
```

### 4-3. Tailwind CSS の設定

`vite.config.ts` を以下のように修正する。

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
})
```

`src/style.css` の中身を以下に書き換える。

```css
@import "tailwindcss";
```

### 4-4. ESLint / Prettier の設定

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-vue prettier eslint-config-prettier
```

プロジェクトルートに `eslint.config.ts` を作成する。

```typescript
import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
]
```

プロジェクトルートに `.prettierrc` を作成する。

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
```

### 4-5. 共通型定義ファイルの作成

`src/types.ts` を作成する。

```typescript
/**
 * 家計簿1件分のデータ型
 * DynamoDB に保存されるレコードの構造と対応している
 */
export interface Transaction {
  id: string       // 一意なID（Lambda側で uuid を自動生成）
  date: string     // 日付（例: "2024-03-28"）
  amount: number   // 金額（円）
  item: string     // 品物名（例: "昼飯"）
  userId: string   // LINE のユーザーID（liff.getProfile() から取得）
  groupId?: string // グループトークのID（個人トークの場合は undefined）
}

/**
 * LIFF から取得できるコンテキスト情報
 * liff.getContext() の戻り値から必要な部分だけを抽出した型
 */
export interface LiffContext {
  userId: string   // LINE ユーザーID
  groupId?: string // グループトークのID（グループ外から開いた場合は undefined）
  roomId?: string  // 複数人トークのID（通常は undefined）
}
```

---

## ステップ5：フロントエンドの実装

### 5-1. 定数ファイルの作成

`src/constants.ts` を作成する。APIのURLとLIFF IDはここで管理する。

```typescript
// ============================================================
// アプリ全体で使う定数をこのファイルで一元管理する
// 値を変更するときはここだけ直せばOK
// ============================================================

// LIFF ID
// LINE Developers コンソール > LIFF-v3チャネル > LIFFタブ で発行される
// 形式: "数字-英数字"（例: "2009627798-VOeFmL56"）
export const LIFF_ID = 'YOUR_LIFF_ID'

// API Gateway のエンドポイント URL
// 記事③で Lambda + API Gateway を作成した後に差し替える
// 末尾のスラッシュは不要
// 例: "https://xxxx.execute-api.ap-northeast-1.amazonaws.com/prod"
export const API_BASE_URL = 'YOUR_API_URL'
```

> `YOUR_LIFF_ID` と `YOUR_API_URL` は後で実際の値に置き換える。

### 5-2. App.vue の実装

`src/App.vue` を以下の内容に書き換える。

画面は「💰 家計簿記録」フォームと「📊 期間集計」の2カードで構成する。履歴の一覧表示は画面上には持たず、LINEのトークルームで「最新の履歴を表示」と送ることで確認できる（バックエンド側で対応）。

```vue
<script setup lang="ts">
/**
 * <script setup lang="ts"> とは
 * - "setup" を付けると defineComponent() などの定型文が不要になる Vue 3 の記法
 * - "lang="ts"" で TypeScript を使うことを宣言する
 */

import { ref, onMounted } from 'vue'
// ref       : リアクティブな変数を作る関数。値が変わると画面が自動更新される
// onMounted : コンポーネントが画面に表示された直後に1回だけ実行する処理を登録する

import liff from '@line/liff'
// LINE Front-end Framework SDK
// LINE ユーザー情報の取得・メッセージ送信・ウィンドウ操作などに使う

import axios from 'axios'
// HTTP クライアント。バックエンドの API を呼び出すために使う

import type { LiffContext } from './types'
// "import type" は TypeScript の型情報だけをインポートする（実行時には消える）

import { LIFF_ID, API_BASE_URL } from './constants'

// ============================================================
// 状態管理
// ref() で定義した変数が画面の表示を制御する
// 変数名.value で値を読み書きする（テンプレート内では .value 不要）
// ============================================================
const isLoading = ref(true)               // true の間「読み込み中...」を表示
const isSaving = ref(false)               // true の間「送信中...」を表示してボタンを無効化
const isSummaryLoading = ref(false)       // true の間「集計中...」を表示
const liffContext = ref<LiffContext | null>(null) // LINE ユーザーの情報（初期値は null）
const errorMessage = ref('')              // エラーメッセージ（空文字のときは表示しない）
const summaryTotal = ref<number | null>(null) // 集計結果（null = 未集計）

// ============================================================
// フォームの入力値
// v-model でテンプレートの <input> と双方向に同期する
// ============================================================
const date = ref(getTodayJST())  // 日付（初期値: 今日の日付）
const amount = ref(1000)         // 金額（初期値: 1000円）
const item = ref('昼飯')         // 品物名（初期値: 昼飯）

// 集計期間の入力値（初期値: 当月1日〜今日）
const summaryStartDate = ref(getFirstDayOfMonthJST())
const summaryEndDate = ref(getTodayJST())

/**
 * 日本時間（JST）で今日の日付を "YYYY-MM-DD" 形式で返す
 *
 * new Date() はブラウザのローカル時間を返すが、
 * Lambda（UTC）との時刻ズレを防ぐため明示的に JST へ変換する
 */
function getTodayJST(): string {
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
function getFirstDayOfMonthJST(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // UTC メソッドを使って JST の年・月を取得する
  const year = jst.getUTCFullYear()
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0') // 1桁の月を "01" 形式にする
  return `${year}-${month}-01`
}

/**
 * LIFF 初期化
 * onMounted でコンポーネント表示直後に実行する
 * ① LIFF を初期化 → ② 未ログインならリダイレクト → ③ ユーザー情報取得
 */
onMounted(async () => {
  try {
    // LIFF の初期化（必ず最初に呼ぶ必要がある）
    await liff.init({ liffId: LIFF_ID })

    // LINE アプリ経由でなくブラウザで直接開いた場合はログイン画面にリダイレクト
    if (!liff.isLoggedIn()) {
      liff.login()
      return // login() はリダイレクトするのでここで処理を止める
    }

    // ログイン済みの場合は LINE ユーザー情報を取得
    const profile = await liff.getProfile() // userId, displayName など
    const context = liff.getContext()       // グループID、ルームID など

    liffContext.value = {
      userId: profile.userId,
      // "??" は null / undefined のときだけ右辺を返す「null 合体演算子」
      groupId: context?.groupId ?? undefined,
      roomId: context?.roomId ?? undefined,
    }
  } catch (err) {
    // 初期化に失敗した場合はエラーメッセージを画面に表示する
    errorMessage.value = `初期化エラー: ${(err as Error).message}`
  } finally {
    // 成功・失敗に関わらず必ずローディングを終了する
    isLoading.value = false
  }
})

/**
 * 保存処理
 * ① LINE トークルームにメッセージを送信
 * ② バックエンド API に保存（DynamoDB に書き込まれる / Slack に通知される）
 * ③ LIFF ウィンドウを閉じて LINE のトーク画面に戻る
 */
async function save() {
  // バリデーション: 金額が空の場合はアラートを出して処理を中断
  if (!amount.value) {
    alert('金額を入力してください')
    return
  }
  // liffContext が null の場合（初期化失敗）は何もしない
  if (!liffContext.value) return

  isSaving.value = true // ボタンを「送信中...」に変えて二重送信を防ぐ
  try {
    // ① LINE のトークルームにメッセージを送信
    //    liff.sendMessages() は LIFF アプリを開いたトークルームに送れる
    await liff.sendMessages([
      {
        type: 'text',
        text: `💰 家計簿記録完了！\n日付: ${date.value}\n金額: ${amount.value}円\n品物: ${item.value}`,
      },
    ])

    // ② バックエンド API にデータを保存（Lambda が DynamoDB 保存 + Slack 通知を行う）
    await axios.post(`${API_BASE_URL}/transaction`, {
      userId: liffContext.value.userId,
      groupId: liffContext.value.groupId,
      date: date.value,
      amount: amount.value,
      item: item.value,
    })

    // ③ 保存完了を通知（画面はそのまま保持）
    alert('保存しました！！')
  } catch (err) {
    alert(`エラーが発生しました: ${(err as Error).message}`)
  } finally {
    isSaving.value = false // 成功・失敗に関わらずボタンを元に戻す
  }
}

/**
 * 期間集計処理
 * GET /summary?userId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 指定期間内の支出合計を取得して summaryTotal に格納する
 */
async function fetchSummary() {
  if (!liffContext.value) return
  if (!summaryStartDate.value || !summaryEndDate.value) {
    alert('集計期間を入力してください')
    return
  }

  isSummaryLoading.value = true
  summaryTotal.value = null // 前回の結果をリセット
  try {
    // GET /summary?userId=xxx&startDate=xxx&endDate=xxx を呼び出す
    const res = await axios.get<{ total: number }>(`${API_BASE_URL}/summary`, {
      params: {
        userId: liffContext.value.userId,
        startDate: summaryStartDate.value,
        endDate: summaryEndDate.value,
      },
    })
    summaryTotal.value = res.data.total // 取得した合計金額を格納
  } catch (err) {
    alert(`集計エラー: ${(err as Error).message}`)
  } finally {
    isSummaryLoading.value = false
  }
}
</script>

<template>
  <!--
    Tailwind CSS のよく使うクラス（覚えておくと便利）
    min-h-screen  : 最小の高さをビューポート全体に設定
    bg-gray-50    : 薄いグレーの背景色
    p-4           : padding を 1rem（16px）に設定
    max-w-md      : 最大幅を 28rem（448px）に設定
    mx-auto       : 左右の margin を auto にして中央揃え
    space-y-4     : 子要素の間に縦方向のスペース（1rem）を追加
  -->
  <div class="min-h-screen bg-gray-50 p-4">

    <!-- ローディング: isLoading が true の間だけ表示 -->
    <div v-if="isLoading" class="flex items-center justify-center h-screen">
      <p class="text-gray-500">読み込み中...</p>
    </div>

    <!-- エラー表示: errorMessage に文字列がある場合に表示 -->
    <div v-else-if="errorMessage" class="bg-red-100 text-red-700 p-4 rounded-lg">
      {{ errorMessage }}
    </div>

    <!-- メイン画面: ローディング完了かつエラーなしの場合に表示 -->
    <div v-else class="max-w-md mx-auto space-y-4">

      <!-- 入力フォームカード -->
      <div class="bg-white rounded-xl shadow p-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4">💰 家計簿記録</h3>

        <label class="block text-sm text-gray-600 mb-1">日付</label>
        <!-- v-model="date" で入力値と date ref が双方向に同期する -->
        <input v-model="date" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

        <label class="block text-sm text-gray-600 mb-1">金額</label>
        <!--
          v-model.number : 入力値を自動的に数値型に変換する（.number 修飾子）
          inputmode="numeric" : スマホ表示時に数字キーボードを出す
        -->
        <input
          v-model.number="amount"
          type="number"
          inputmode="numeric"
          class="w-full border rounded-lg px-3 py-2 mb-3"
        />

        <label class="block text-sm text-gray-600 mb-1">品物</label>
        <input v-model="item" type="text" class="w-full border rounded-lg px-3 py-2 mb-4" />

        <!--
          @click="save"      : クリック時に save() を呼び出す（@ は v-on: の省略形）
          :disabled="isSaving": isSaving が true の間ボタンを無効化（: は v-bind: の省略形）
        -->
        <button
          @click="save"
          :disabled="isSaving"
          class="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
        >
          <!-- isSaving の値によって表示テキストを切り替える（三項演算子） -->
          {{ isSaving ? '送信中...' : '保存する' }}
        </button>
      </div>

      <!-- 集計カード -->
      <div class="bg-white rounded-xl shadow p-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4">📊 期間集計</h3>

        <label class="block text-sm text-gray-600 mb-1">開始日</label>
        <input v-model="summaryStartDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-3" />

        <label class="block text-sm text-gray-600 mb-1">終了日</label>
        <input v-model="summaryEndDate" type="date" class="w-full border rounded-lg px-3 py-2 mb-4" />

        <button
          @click="fetchSummary"
          :disabled="isSummaryLoading"
          class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition"
        >
          {{ isSummaryLoading ? '集計中...' : '集計する' }}
        </button>

        <!-- 集計結果: summaryTotal が null でないときだけ表示 -->
        <div v-if="summaryTotal !== null" class="mt-4 p-3 bg-blue-50 rounded-lg text-center">
          <p class="text-sm text-gray-600">{{ summaryStartDate }} 〜 {{ summaryEndDate }}</p>
          <!-- toLocaleString() で数値を "1,000" のように3桁区切りで表示 -->
          <p class="text-2xl font-bold text-blue-700 mt-1">{{ summaryTotal.toLocaleString() }}円</p>
        </div>
      </div>

    </div>
  </div>
</template>
```

### 5-3. 動作確認（ローカル）

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開き、フォームが表示されることを確認する。

> **この時点では以下のエラーが表示されるが正常**。LIFFはエンドポイントURLとアクセス元URLが一致しないと動作しない仕組みのため、`localhost` からアクセスすると `channel not found` エラーになる。記事④でCloudFrontのURLをLIFFに登録した後、スマホのLINEアプリ経由で初めて正常動作する。ローカルでの確認はここで完了。

---
