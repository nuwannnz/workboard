/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Frontend Vite config. React + PWA (manifest + service worker via
 * vite-plugin-pwa, T019). Tauri consumes this same build output, so both the
 * installable PWA and the desktop app render the identical shell (Principle II).
 */
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/frontend',
  // `amazon-cognito-identity-js` references Node's `global`, which does not exist in the
  // browser. Alias it to `globalThis` so the shared auth code runs in the PWA and desktop.
  define: {
    global: 'globalThis',
  },
  server: {
    port: 4200,
    host: 'localhost',
    // Same-origin proxies for fully-local dev, so the browser never makes a cross-origin
    // request (no CORS anywhere). `/api` → local Express backend; `/cognito` → cognito-local
    // emulator. In deployed builds these vars point straight at API Gateway / real Cognito.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/cognito': {
        target: 'http://localhost:9229',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cognito/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'WorkBoard',
        short_name: 'WorkBoard',
        description: 'Personal productivity workspace',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
  },
});
