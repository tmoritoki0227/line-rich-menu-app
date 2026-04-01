// Vue Router 設定
//
// パスとページコンポーネントの対応を定義する。
// 新しい画面を追加するときはここにルートを追記する。

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // --- 家計簿（既存） ---
    {
      path: '/',
      component: () => import('../App.vue'),  // 既存の App.vue をそのまま使う
    },

    // --- モバイルオーダー：お客側 ---
    {
      path: '/order',
      component: () => import('../pages/order/MenuPage.vue'),
    },
    {
      path: '/order/cart',
      component: () => import('../pages/order/CartPage.vue'),
    },
    {
      path: '/order/confirm',
      component: () => import('../pages/order/ConfirmPage.vue'),
    },
    {
      path: '/order/status/:orderId',
      component: () => import('../pages/order/StatusPage.vue'),
    },

    // --- モバイルオーダー：スタッフ側 ---
    {
      path: '/order/staff',
      component: () => import('../pages/order/staff/OrderListPage.vue'),
    },
    {
      path: '/order/staff/:orderId',
      component: () => import('../pages/order/staff/OrderDetailPage.vue'),
    },
  ],
})

export default router
