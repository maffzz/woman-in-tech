import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-icon-180.png'],
      manifest: {
        name: 'Con Yala, cada yapeo cuenta.',
        short_name: 'Yala',
        description: 'Gestiona tus gastos, salidas con amigos y construye tu historial financiero.',
        start_url: '/',
        display: 'standalone',
        background_color: '#6b49d4',
        theme_color: '#6b49d4',
        orientation: 'portrait',
        lang: 'es',
        categories: ['finance', 'utilities'],
        icons: [
          {
            src: '/icons/manifest-icon-192.maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/manifest-icon-512.maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cachear todo el frontend para funcionar offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Las llamadas a la API se intentan en red primero, caen a cache si no hay internet
            urlPattern: /^http:\/\/localhost:4000\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'yala-api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Fuentes de Google
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
      devOptions: {
        enabled: false, // no activar SW en desarrollo para no interferir
      },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173, host: '0.0.0.0' }, // accesible en la red local
});
