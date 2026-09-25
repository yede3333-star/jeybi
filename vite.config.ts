import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/jeybi/").
// Locally and on Netlify a relative base works everywhere thanks to HashRouter.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: { chunkSizeWarningLimit: 700 },
  // APP_BUILD = commit count, set by CI: the same number as the Android versionCode.
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(process.env.APP_BUILD ?? '') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // prompt: a new version waits and activates when the app is closed and reopened (or when the
      // user taps "restart" in the in-app banner). Never reloads the page mid-use (autoUpdate did,
      // which could lose a half-typed entry and asked for the PIN twice).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'جيبي · Jeybi',
        short_name: 'Jeybi',
        description: 'إدارة أموالك الشخصية — Gestion de votre argent',
        lang: 'ar',
        dir: 'auto',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f5',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
