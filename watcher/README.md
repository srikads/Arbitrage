# arbitrage-watcher

The watcher half of the assistant. It watches long-term European stock/ETF
holdings and a watchlist around the clock, then writes an **encrypted** feed
of signals, alerts and digests for the app. It also sends Web Push
notifications for things that matter.

It reads public market data and sends notifications. It **never** talks to a
broker or bank and has no way to trade.

> Not financial advice. Suggestions are automated summaries of public data
> to support your own decisions.

## How it works

```
data/config.enc ──► decrypt ──► holdings, candidates, settings, push target
                                   │
  broad RSS feeds ──────────────┐  │  (matching happens locally)
  Bluesky search  (padded)  ────┤  │
  forum board pages ────────────┤  ├─► scoring (LLM via Ollama, or lexicon fallback)
  Wikipedia pageviews (padded) ─┤  │
  Yahoo prices (padded) ────────┘  ├─► technicals ─► signal engine ─► alerts ─► Web Push
                                   └─► daily / weekly digest
                                            │
                     data/feed.enc ◄── encrypt ──► data/state.enc
```

| Module | Role |
|---|---|
| `crypto.py` | Envelope from contract §2 (PBKDF2-SHA256 600k + AES-256-GCM). |
| `universe.py` | Loads `shared/instruments.json` and keeps a stable set of decoys (at least 3× the real instruments). |
| `prices.py`, `technicals.py`, `pricing.py` | yfinance batch downloads (daily 5y once a day, otherwise 1y, plus intraday 5d/15m), RSI14, SMA50/200, volume z-score, drawdown, 1h move, earnings dates. |
| `resolve.py` | Resolves user-added ISINs through Yahoo search. Each lookup is padded with decoy ISIN lookups. |
| `news.py`, `news_sources.py`, `matching.py` | Broad RSS feeds, local word-boundary matching (name, aliases, ISIN, symbol) and macro tagging. |
| `crowd/` | Bluesky search, forum board pages (with optional Playwright), Wikipedia attention z-score. |
| `llm.py`, `prompts.py`, `scoring.py` | Ollama JSON scoring in batches. Results are cached per item and instrument. |
| `lexicon.py`, `lexicon_data.py` | EN+DE financial sentiment lexicon with negation, intensifiers and phrases. Used as the fallback. |
| `factors.py`, `signals.py` | Deterministic signal engine. Thresholds scale with `Settings.risk`. |
| `narrative.py` | Signal headline and reasoning, written by the LLM or from a template. |
| `alerts.py`, `notify.py`, `push.py`, `quiet.py` | Alert rules, cooldowns, quiet hours, daily push cap and pywebpush delivery. |
| `digest.py`, `fx.py`, `calendar_data.py` | Daily and weekly markdown digests. Portfolio totals are converted to EUR. |
| `market.py` | XETRA hours and holidays, digest timing and `--mode auto`. |
| `feed.py`, `runner.py`, `cli.py` | Feed assembly and validation, orchestration and the CLI. |

### Signal engine

Each instrument gets factors with a value from −1 to 1 and a weight:

- **news**: sentiment weighted by impact and relevance, with a 36 h half-life
- **macro**: rates, inflation and tariffs, for holdings only
- **crowd**: Bluesky and forum posts; it needs at least 5 posts
- **attention**: a Wikipedia spike amplifies the current tone
- **trend**: SMA50/200 and price vs SMA200
- **RSI extremes**
- **sharp moves**
- **volume anomaly**
- **position rules**: stop-loss and take-profit vs `buyPrice`
- **candidate target price**
- **earnings proximity**: this factor only raises risk

**Score.** The score is the weighted mean of the factors. When the evidence
is thin the score shrinks toward 0.

**Confidence.** Confidence is high only when three things are true:

- the factors **agree** with each other
- there is **enough evidence**
- the signal is **strong**

**Actions.** The score and confidence map to one of: hold, watch, consider
trim, consider sell, consider buy, consider add. The thresholds depend on
`Settings.risk`:

- At **0 (conservative)**, sell or buy needs a score of at least |0.6| and
  confidence ≥ 0.75.
- At **1 (balanced)**, sell or buy needs a score of at least |0.4| and
  confidence ≥ 0.6.

**Overrides.** Stop-loss, take-profit and target-price rules override the
score-based action.

### Alerts and notifications

Alerts are created for:

- a signal change
- stop-loss, take-profit or target hit
- high-impact news
- a sharp move (|1h| > 3 % or |1d| > 5 %)
- earnings tomorrow
- high-impact macro news

**Cooldown.** The same instrument and kind alerts at most once every 6 h,
unless the severity goes up.

**What gets pushed.** Only `important` and `critical` alerts are pushed, plus
a "digest ready" note.

**Quiet hours.** During quiet hours (in `Settings.timezone`), only `critical`
alerts are pushed. The rest are queued and sent after quiet hours end, as one
summary push.

**Push cap.** At most 6 non-critical pushes are sent per day. An expired
subscription (HTTP 404/410) is noted once, and the app asks you to re-enable
notifications.

## Privacy model

- Everything the watcher writes to the repo is encrypted with `ARB_PASSPHRASE`.
- Logs contain only counts, stage names and timings. Exceptions are logged as
  their type only, and output from third-party libraries is silenced, because
  it can contain symbols or URLs.
- **News** comes only from broad RSS feeds. All filtering happens locally.
- **Per-ticker requests** are padded with at least 3× decoys from the shared
  universe and sent in shuffled order. This covers Yahoo prices and earnings,
  Yahoo ISIN search, Bluesky search and Wikipedia pageviews.
  - The decoy set is stored in state and only ever grows. Repeated requests
    therefore can't be intersected to reveal the real set.
  - A removed holding stays on as a decoy.
  - If the universe is too small to supply 3× decoys, per-ticker sources are
    skipped instead.
- **Forums**: only board and "latest" pages are fetched, never per-instrument
  URLs.
- No request ever contains quantities, buy prices or account data.
- `--dry-run` prints a decrypted summary to stdout. Use it only on your own
  machine, never in CI.

## Running

```bash
cd watcher
pip install -e .[dev]          # add [forums] for the optional Playwright fallback
export ARB_PASSPHRASE='…'
python -m arbitrage_watcher run --repo-dir .. --mode auto --dry-run
python -m arbitrage_watcher run --repo-dir .. --mode deep --ollama-url http://127.0.0.1:11434 --model qwen2.5:7b
python -m arbitrage_watcher plan --repo-dir ..   # prints needs_llm=… and mode=…
pytest -q
```

### Modes

- `light`: lexicon scoring only. This is the fastest mode.
- `deep`: LLM scoring of new items plus LLM-written explanations.
- `digest`: a full run plus the daily digest (trading days) or the weekly
  digest (weekends).
- `auto`: picks `digest` when one is due (17:35–21:00 Berlin on trading days,
  or Sunday from 17:00). Otherwise it picks `deep` when there are unscored
  items and Ollama is reachable, and `light` in all other cases.

If `data/config.enc` does not exist, the watcher exits with status 0.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ARB_PASSPHRASE` | (required) | Passphrase for the encryption envelope. |
| `ARB_MODEL` | `qwen2.5:3b` | Ollama model. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama server URL. |
| `ARB_LLM_BUDGET_SEC` | 480 | Maximum seconds of LLM calls per run. |
| `ARB_DEEP_INTERVAL_MIN` | 180 | Minimum gap between deep runs. Only `plan` uses it. |

### Laptop (bigger model)

`scripts/laptop-watch.sh` (Linux) and `scripts/laptop-watch.ps1` (Windows)
run the watcher with the same encrypted files, using a larger model.
`qwen2.5:7b` at q4 fits a 6 GB GPU. Each script does four things:

1. Pulls the repo.
2. Starts Ollama and pulls the model if needed.
3. Runs the watcher.
4. Commits `data/*.enc` as `chore: update feed` and pushes.

Pass `-DryRun` / `--dry-run` to only print the summary.

## GitHub Actions and minutes budget

`.github/workflows/watch.yml` runs as follows:

- **Schedule:** every 30 min from 07:00–17:00 UTC on weekdays, and every
  3 h otherwise.
- **Digest runs:** 15:50 and 16:50 UTC (17:50 Berlin in summer and in
  winter), plus Sunday at 17:05 UTC.

Each run goes through these steps:

1. A cheap `plan` step decides whether the LLM is needed.
2. Ollama is installed only when it is, with `~/.ollama/models` cached by
   model name.
3. The watcher runs.
4. `data/*.enc` is committed if it changed, with retries on
   `git pull --rebase`.

The repo needs:

- the secret `ARB_PASSPHRASE`
- optionally, the variables `ARB_MODEL`, `ARB_DEEP_INTERVAL_MIN` and
  `ARB_LLM_BUDGET_SEC`

Rough monthly estimate (private repo, Linux runner, each job rounded up to the
full minute):

| Run type | Count / month | Billed min each | Total |
|---|---:|---:|---:|
| Light (lexicon) | ~600 | 1–2 | 600–1,000 |
| Deep (≤ 1 per 3 h, only with new relevant items) | ~60–100 | 4–8 | 250–800 |
| Digest (daily + weekly) | ~26 | 4–8 | 100–200 |

These are rough numbers; deep runs depend on how often your instruments are
in the news. If you get close to 2,000 minutes:

- raise `ARB_DEEP_INTERVAL_MIN`
- lower `ARB_LLM_BUDGET_SEC`
- thin out the 30-minute schedule to hourly
- run deep analysis on the laptop and leave CI on light mode (set
  `ARB_DEEP_INTERVAL_MIN` very high)

## Maintenance notes

- `calendar_data.py` holds the ECB decision dates for 2026. Update them every
  year.
- RSS feed URLs (`news_sources.py`) and forum pages (`crowd/forums.py`)
  change from time to time. Dead sources are skipped quietly, and the log
  shows how many responded (`news: 17/21 feeds responded`).
