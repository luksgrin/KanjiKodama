/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Optional HTTPS for testing on a phone over the LAN (service workers need a secure context):
// KK_HTTPS_CERT=... KK_HTTPS_KEY=... npm run preview:lan   (e.g. certificates made with mkcert)
const cert = process.env.KK_HTTPS_CERT;
const key = process.env.KK_HTTPS_KEY;
const https = cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;

// Relative base: works under any subpath (e.g. GitHub Pages) and inside the Capacitor WebView.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/main.tsx (skipped inside Capacitor)
      manifest: {
        name: 'KanjiKodama',
        short_name: 'KanjiKodama',
        description: 'Personal kanji reviews',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#1B4332',
        theme_color: '#1B4332',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + wasm + font are precached.
        globPatterns: ['**/*.{js,css,html,wasm,ttf,png,svg,webmanifest,txt}'],
        // Zen Maru Gothic TTF is 3.8 MB (full font, unsubsetted). Subsetting to the content's
        // character set / WOFF2 is a follow-up; until then allow it into the precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globIgnores: ['content/**'],
        // The ~33 MB content file is too large for the precache manifest (and would make every
        // app update re-download it). It is cached at runtime on first fetch instead, in its
        // own cache that survives app (service-worker) updates. Its name carries its hash
        // (content-<hash>.db, named by content-manifest.json), so a new build is a new URL;
        // the manifest itself is network-first so updates are seen, with the cached copy offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/content\/content-manifest\.json$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kk-content-manifest-v1',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => /\/content\/content-[0-9a-f]+\.db$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kk-content-v1',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [200] },
              rangeRequests: false,
            },
          },
        ],
      },
    }),
  ],
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  build: { target: 'es2022', sourcemap: false },
  server: { https },
  preview: { https },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
