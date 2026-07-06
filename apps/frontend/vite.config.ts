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
  server: {
    port: 4200,
    host: 'localhost',
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
