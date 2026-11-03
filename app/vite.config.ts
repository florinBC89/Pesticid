import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PREVIEW=1 → build relativ, fără service worker (pentru publicare pe un host unde nu controlăm originea)
const preview = process.env.PREVIEW === '1'

export default defineConfig({
  base: preview ? './' : '/',
  plugins: [
    react(),
    !preview && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pesticid — calculator doză',
        short_name: 'Pesticid',
        description: 'Produse omologate, doza corectă și cantitatea per rezervor.',
        lang: 'ro',
        theme_color: '#cedbf6',
        background_color: '#cedbf6',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // shell-ul aplicației offline; răspunsurile API se cachează 7 zile (calculele recente merg fără semnal)
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } } },
          { urlPattern: /\/rest\/v1\//, handler: 'NetworkFirst', options: { cacheName: 'api', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } } },
        ],
      },
    }),
  ].filter(Boolean),
  server: { host: true, port: 5173 },
})
