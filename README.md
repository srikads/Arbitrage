# Arbitrage

A private, read-only investing assistant for European stocks and ETFs.

Arbitrage watches the instruments you hold or are considering. It reads prices,
broad market news, crowd sentiment (Bluesky, investor forums) and
public-attention spikes (Wikipedia), and turns them into plain-language signals
such as *hold*, *watch*, *consider trimming* or *consider buying*. Each signal
comes with a confidence and risk level and the sources behind it. Important
signals arrive as push notifications on your phone.

> **It never touches your money.** Arbitrage has no connection to any bank or
> broker and cannot place orders. It only reads public data and notifies you.
> Signals are informational, not financial advice. Short-term moves are hard
> to predict, so always make your own decision.

## How it works

```
 ┌──────────────── your phone / laptop ────────────────┐
 │  PWA (app/)                                          │
 │  • holdings, watchlist, settings                     │
 │  • everything encrypted with your passphrase         │
 │  • laptop mode: chat with a local LLM (Ollama)       │
 └───────▲───────────────────────────┬──────────────────┘
         │ encrypted feed            │ encrypted config
         │ + Web Push (E2E)          ▼
 ┌───────┴──────── your PRIVATE GitHub repo ───────────┐
 │  data/config.enc  data/feed.enc  data/state.enc     │
 │  Scheduled watcher (watcher/, GitHub Actions)        │
 │  • prices + technicals      • broad news RSS         │
 │  • Bluesky / forums         • Wikipedia attention    │
 │  • small local LLM (Ollama, inside the runner)       │
 │  • signal engine → alerts → digests                  │
 └──────────────────────────────────────────────────────┘
```

- **Privacy:** your portfolio exists only in encrypted form (AES-256-GCM, key
  derived from your passphrase). The watcher decrypts it in memory inside your
  private repo's runner, and its logs never print instrument names or amounts.
  News is fetched from broad feeds and filtered locally. Ticker-specific lookups
  (prices, Bluesky, Wikipedia) are mixed with decoy instruments, so a data
  provider can't tell what you own. No commercial AI API is used: the language
  model runs inside the runner or on your own laptop.
- **Notifications:** standard Web Push. Payloads are end-to-end encrypted to
  your browser, so the push service can't read them. Quiet hours are respected,
  and only *critical* alerts break through.
- **Cadence:** about every 30 minutes during European market hours and every few
  hours otherwise. You get a daily recap after the close and a weekly outlook on
  Sunday evening.

The full data contract between app and watcher is in
[`docs/CONTRACT.md`](docs/CONTRACT.md).

## Repository layout

| Path         | What                                                       |
|--------------|------------------------------------------------------------|
| `app/`       | The PWA (React + TypeScript + Vite)                        |
| `watcher/`   | The scheduled watcher (Python)                             |
| `shared/`    | Instrument universe used for offline search and decoys     |
| `scripts/`   | Universe generator, laptop helpers                         |
| `docs/`      | Contract, screenshots                                      |

## Setup

1. **Make the repository private.** Go to Settings → General → Danger Zone →
   Change visibility.
2. **Host the app.** The app bundle contains no personal data, so any static
   host works:
   - GitHub Pages (`.github/workflows/pages.yml`). Pages on a private repo
     requires a paid GitHub plan.
   - Or Cloudflare Pages / Netlify. Point them at `app/` with build command
     `npm ci && npm run build` and output directory `app/dist`. Details are in
     [`app/README.md`](app/README.md).
3. **Create a fine-grained token.** Go to GitHub → Settings → Developer settings
   → Fine-grained tokens. Give it access to this repository only, with
   *Contents: Read and write* permission. You'll paste it into the app once.
4. **Open the app on your phone**, add it to the home screen, and follow the
   onboarding:
   - choose a passphrase (it can't be recovered, so store it in a password
     manager)
   - connect the repo using the token
   - allow notifications
   - add your holdings (search by name, ISIN or ticker)
5. **Add the passphrase as a repository secret.** In Settings → Secrets and
   variables → Actions, create `ARB_PASSPHRASE` with the same passphrase.
6. **Optionally choose the runner model.** Set the repository variable
   `ARB_MODEL` (default `qwen2.5:3b`).
7. **Enable Actions** and run the *watch* workflow once manually from the
   Actions tab. After that it runs on its schedule.

### Laptop mode (optional)

With [Ollama](https://ollama.com) installed you get deeper analysis and a chat
assistant:

```bash
ollama pull qwen2.5:7b          # fits a 6 GB GPU at 4-bit
# allow the app to talk to Ollama (use your app's origin):
OLLAMA_ORIGINS="https://<your-app-host>" ollama serve
```

- **Ask tab:** open the app on the laptop and use the *Ask* tab to chat with
  your portfolio context.
- **Deeper analysis run:** `scripts/laptop-watch.sh` (or `.ps1` on Windows)
  runs the watcher locally with the bigger model and pushes the results.

## GitHub Actions budget

Private repositories get 2,000 free Actions minutes per month. Most runs only
fetch data and score with a lexicon, taking about 1 minute each. The LLM is only
installed when there is new relevant news or a digest is due. The default
schedule stays within the free tier. See [`watcher/README.md`](watcher/README.md)
for the breakdown and how to tune it.

## Development

```bash
# app
cd app && npm ci && npm run dev        # http://localhost:5173/?demo=1 for demo data
npm test && npm run build

# watcher
cd watcher && pip install -e .[dev] && pytest -q
```

## Disclaimer

This software is for personal information only. It is not investment advice,
and it makes no guarantee about future prices. Use at your own risk.
