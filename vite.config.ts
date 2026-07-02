import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'setomusubi-bg.jpg'],
      manifest: {
        name: 'せとむすび デモ',
        short_name: 'せとむすび',
        description: '介護タクシー×医療機関 予約プラットフォームのデモ',
        theme_color: '#0f766e',
        background_color: '#f0f9f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/demo',
        scope: '/',
        lang: 'ja',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // すべての静的アセット（JS / CSS / HTML / 画像）をプリキャッシュ
        globPatterns: ['**/*.{js,css,html,svg,jpg,jpeg,png,ico,woff,woff2}'],
        // SPA ルーティングのフォールバック（デモ系URLを叩いても index.html を返す）
        navigateFallback: '/index.html',
        // 認証が必要な本番API系は SW にキャッシュさせない
        navigateFallbackDenylist: [
          /^\/api\//,
          /\/functions\/v1\//,
          /supabase\.co/,
        ],
        // Supabase / 外部APIのキャッシュ戦略（オフライン時は失敗してよい）
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          // supabase.co のレスポンス（患者名等の要配慮個人情報を含む）は
          // CacheStorageに平文保存されるため意図的にキャッシュしない（NetworkOnly相当）。
        ],
        // PWA キャッシュ容量上限を緩める（vendor JS が大きいため）
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-datefns'
          }
        },
      },
    },
  },
})
