# Arbitrage — app

The installable web app (PWA) for managing holdings and watched instruments, reading
signals, alerts and digests, and configuring the watcher. It implements the data
contract in [`docs/CONTRACT.md`](../docs/CONTRACT.md).

## Privacy model

- Everything is encrypted with your passphrase (AES-256-GCM, PBKDF2-SHA256, 600 000
  iterations — CONTRACT §2), both on the device (IndexedDB) and in the repository
  (`data/config.enc`). The passphrase and derived keys only live in memory and are
  dropped on lock / auto-lock.
- The app talks to exactly three places: `api.github.com` (your repository, with your
  fine-grained token), the browser's push service (end-to-end encrypted) and, if you
  use **Ask**, Ollama on `localhost`. A strict Content-Security-Policy in the
  production build enforces this. No analytics, fonts or CDNs.
- It never connects to any bank or broker. Signals are not financial advice.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # type-check + production build into dist/
```

Demo mode (development only): open `http://localhost:5173/?demo=1` for a fictional
portfolio and feed — no GitHub needed. Demo data is clearly labelled and is not part
of production builds (set `VITE_ENABLE_DEMO=1` to include it anyway).

Screenshots: with the dev server running, `npm run screenshots` writes PNGs to
`docs/screenshots/` (uses an installed Playwright Chromium).

Icons are generated with `npm run icons` (pure JS rasteriser, output in `public/icons/`).

The offline instrument universe is `../shared/instruments.json`; the build emits it as
`instruments.json` (falls back to `fixtures/instruments.dev.json` if missing).

## Setup (user)

1. Open the app, choose a passphrase. Add the same passphrase to the repository as
   the Actions secret `ARB_PASSPHRASE`.
2. Create a fine-grained personal access token: *Repository access* → only your
   watcher repository; *Permissions* → **Contents: Read and write**. Nothing else.
3. Enable notifications (on iOS, add the app to the home screen first).
4. Add holdings. Changes are synced to `data/config.enc` about two seconds later.

## Deploy

The app is a static bundle (`dist/`) and uses hash routing with relative paths, so it
works on any static host and under any sub-path. The bundle contains no user data.

- **GitHub Pages**: `.github/workflows/pages.yml` builds and deploys on pushes to
  `main` that touch `app/**` or `shared/instruments.json`. Pages on *private*
  repositories requires a paid GitHub plan. Enable it under *Settings → Pages →
  Source: GitHub Actions*.
- **Cloudflare Pages**: build command `cd app && npm ci && npm run build`, output
  directory `app/dist`. Or upload directly: `npx wrangler pages deploy app/dist`.
- **Netlify**: base directory `app`, build command `npm run build`, publish
  directory `app/dist`. Or `npx netlify deploy --prod --dir app/dist`.

Web Push requires HTTPS (or `localhost`).

### Ask (local model)

Ask streams answers from Ollama running on the same computer. Allow the app's origin
and restart Ollama, e.g. `OLLAMA_ORIGINS=https://you.github.io`. The app shows the
exact value for its own origin.

## Structure

```
src/lib/        contract types, crypto envelope, VAPID, ISIN, search, portfolio maths,
                GitHub contents API, IndexedDB, Ollama client, markdown renderer
src/state/      app state (vault/session, sync, feed), auto-lock
src/screens/    portfolio, instrument, add, signals, digest, ask, settings, onboarding
src/components/ layout (sidebar / tab bar), list rows, chart, small UI pieces
src/sw/sw.ts    service worker: precache, push, notificationclick
src/demo/       fictional demo data (dev only)
tests/          vitest
```
