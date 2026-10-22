/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHARED_INSTRUMENTS = resolve(here, '../shared/instruments.json');
const DEV_FIXTURE = resolve(here, 'fixtures/instruments.dev.json');

/**
 * Serves `instruments.json` (the offline instrument universe) from
 * `../shared/instruments.json` in dev and emits it into the build output.
 * Falls back to a small dev fixture when the shared file does not exist yet.
 */
function instrumentsPlugin(): Plugin {
  const load = (): string => {
    const src = existsSync(SHARED_INSTRUMENTS) ? SHARED_INSTRUMENTS : DEV_FIXTURE;
    const raw = readFileSync(src, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${src}: expected an array of instruments`);
    return JSON.stringify(parsed);
  };
  return {
    name: 'arbitrage-instruments',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0].endsWith('/instruments.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(load());
          return;
        }
        next();
      });
    },
    generateBundle() {
      if (!existsSync(SHARED_INSTRUMENTS)) {
        this.warn('shared/instruments.json not found, bundling the small dev fixture instead');
      }
      this.emitFile({ type: 'asset', fileName: 'instruments.json', source: load() });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    instrumentsPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        name: 'Arbitrage',
        short_name: 'Arbitrage',
        description: 'Private portfolio assistant for long-term investors.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0b0c',
        theme_color: '#0b0b0c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
