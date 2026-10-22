# Data contract

This document is the single source of truth for everything the PWA (`app/`) and
the watcher (`watcher/`) exchange. Both sides MUST follow it exactly.

## 1. Principles

- The repository that runs the watcher is **private**. Even so, every file the
  watcher or the PWA writes to the repo is **encrypted**; plaintext portfolio data
  never touches git or logs.
- The watcher never prints tickers, names, ISINs, quantities or prices to stdout.
  Logs contain only counts and timings.
- The watcher has **no access to any broker or bank**. It only reads public market
  data and sends notifications.
- Requests to third-party data sources never contain the user's quantities or
  prices. Ticker-specific requests are padded with decoy instruments (see §6).

## 2. Encryption envelope

Every `*.enc` file in `data/` is UTF-8 JSON of this shape:

```json
{
  "v": 1,
  "alg": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iter": 600000,
  "salt": "<base64, 16 bytes>",
  "iv": "<base64, 12 bytes>",
  "ct": "<base64, ciphertext || 16-byte GCM tag>"
}
```

- Key = PBKDF2-HMAC-SHA256(passphrase UTF-8, salt, iter, 32 bytes).
- Plaintext = UTF-8 JSON. No additional authenticated data.
- A fresh random salt and IV are generated on every write.
- WebCrypto `AES-GCM` output (`ct||tag`) and Python
  `cryptography.hazmat.primitives.ciphers.aead.AESGCM` output are identical in
  layout, so both sides interoperate directly.
- base64 is standard (with padding), not URL-safe.

The passphrase is chosen by the user in the PWA and stored as the repository
secret `ARB_PASSPHRASE` for the watcher.

## 3. Files in the repo

| Path               | Written by | Read by | Content (decrypted)        |
|--------------------|------------|---------|----------------------------|
| `data/config.enc`  | PWA        | watcher | `Config` (§4)              |
| `data/feed.enc`    | watcher    | PWA     | `Feed` (§5)                |
| `data/state.enc`   | watcher    | watcher | opaque watcher state        |

The PWA reads and writes via the GitHub REST contents API
(`GET/PUT /repos/{owner}/{repo}/contents/{path}`) using a fine-grained personal
access token limited to this one repository with "Contents: read & write".
Commits made by the PWA use the message `chore: update config`.
Commits made by the watcher use `chore: update feed` and are authored as
`arbitrage-watcher <watcher@users.noreply.github.com>`.

## 4. `Config` (PWA → watcher)

```ts
type Config = {
  version: 1;
  updatedAt: string;                 // ISO 8601
  holdings: Position[];
  candidates: Candidate[];
  settings: Settings;
  push: PushTarget | null;
};

type Instrument = {
  id: string;                        // stable id, = ISIN when known, else symbol
  isin: string | null;
  symbol: string;                    // Yahoo Finance symbol, e.g. "SIE.DE", "EUNL.DE"
  name: string;                      // display name, e.g. "Siemens"
  type: "stock" | "etf";
  currency: string;                  // "EUR"
  aliases: string[];                 // extra match terms for news filtering, e.g. ["Siemens AG"]
  wikipedia: string | null;          // English Wikipedia article title, e.g. "Siemens"
};

type Position = Instrument & {
  quantity: number;
  buyPrice: number;                  // average buy price per unit, in `currency`
  buyDate: string | null;            // "YYYY-MM-DD", optional
  stopLossPct: number | null;        // e.g. 15 => alert at -15% from buyPrice; null = use settings default
  takeProfitPct: number | null;      // e.g. 30 => alert at +30% from buyPrice
};

type Candidate = Instrument & {
  targetPrice: number | null;        // alert when price <= targetPrice
  note: string;
};

type Settings = {
  risk: number;                      // 0 = conservative … 1 = balanced (slider)
  quietHours: { start: string; end: string };   // "22:00", "07:30", Europe/Berlin
  timezone: string;                  // "Europe/Berlin"
  defaultStopLossPct: number;        // 15
  defaultTakeProfitPct: number;      // 30
  sources: {
    news: boolean;
    bluesky: boolean;
    forums: boolean;
    wikipedia: boolean;
  };
  digest: { daily: boolean; weekly: boolean };
};

type PushTarget = {
  subscription: {                    // PushSubscription.toJSON()
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPublicKey: string;            // base64url, uncompressed P-256 point (65 bytes)
  vapidPrivateKey: string;           // base64url, raw 32-byte P-256 private scalar
  contact: string;                   // "mailto:noreply@example.com"
};
```

The PWA generates the VAPID key pair in the browser (WebCrypto ECDSA P-256),
subscribes with the public key, and stores both keys in the encrypted config so
no extra secrets are needed.

## 5. `Feed` (watcher → PWA)

```ts
type Feed = {
  version: 1;
  generatedAt: string;               // ISO 8601
  run: { mode: "light" | "deep" | "digest"; llm: string | null; durationSec: number };
  market: { isOpen: boolean; note: string };
  instruments: Record<string, InstrumentSnapshot>;   // key = Instrument.id
  alerts: Alert[];                   // newest first, max 200
  digests: Digest[];                 // newest first, max 30
  resolved: Record<string, { symbol: string; name: string; currency: string }>; // id -> resolved data for user-added ISINs
};

type InstrumentSnapshot = {
  id: string;
  price: number | null;
  currency: string;
  changePct1d: number | null;
  asOf: string | null;               // ISO time of last price
  history: {                         // for charts
    daily: [string, number][];       // ["YYYY-MM-DD", close], up to ~5y
    intraday: [string, number][];    // [ISO time, price], last 5 trading days, 15m bars
  };
  technicals: {
    rsi14: number | null;
    sma50: number | null;
    sma200: number | null;
    volumeZ: number | null;          // today's volume vs 20d mean, z-score
    drawdownFrom52wHighPct: number | null;
    move1hPct: number | null;
  };
  nextEarnings: string | null;       // "YYYY-MM-DD"
  signal: Signal;
  events: Event[];                   // newest first, max 50 — shown as chart markers and in the source list
};

type SignalAction =
  | "hold" | "watch" | "consider_trim" | "consider_sell"
  | "consider_buy" | "consider_add";

type Signal = {
  action: SignalAction;
  confidence: number;                // 0..1
  risk: "low" | "medium" | "high";
  score: number;                     // -1 (very bearish) .. +1 (very bullish)
  horizon: "hours" | "days" | "weeks" | "months";
  headline: string;                  // one line, e.g. "Strong earnings beat, momentum positive"
  reasoning: string;                 // 2–4 plain-language sentences
  factors: { name: string; value: number; weight: number; note: string }[]; // value -1..1
  updatedAt: string;
};

type Event = {
  id: string;                        // stable hash, used for dedupe
  time: string;                      // ISO 8601
  kind: "news" | "bluesky" | "forum" | "attention" | "price" | "earnings";
  title: string;
  summary: string;
  url: string | null;
  source: string;                    // "tagesschau.de", "Bluesky", "wallstreet-online", "Wikipedia"
  sentiment: number;                 // -1..1
  impact: "low" | "medium" | "high";
};

type Alert = {
  id: string;
  time: string;
  instrumentId: string | null;       // null for portfolio-wide alerts
  severity: "info" | "important" | "critical";
  title: string;                     // shown as notification title
  body: string;                      // shown as notification body (<= 180 chars)
  action: SignalAction | null;
  confidence: number | null;
  eventIds: string[];
  pushed: boolean;
};

type Digest = {
  id: string;
  time: string;
  kind: "daily" | "weekly";
  title: string;
  markdown: string;                  // rendered by the PWA
};
```

## 6. Privacy rules for outbound requests

1. **News**: only broad RSS feeds (general business/market news). Filtering for
   the user's instruments happens locally.
2. **Prices / per-ticker endpoints / Bluesky search / Wikipedia pageviews**: the
   real instruments are mixed with at least 3× as many decoys drawn from
   `shared/instruments.json`, and the request order is shuffled.
3. **Forums**: only broad "latest posts" or board-level pages are fetched; no
   per-instrument URLs.
4. No request ever includes quantities, buy prices or anything account-related.

## 7. Push payload

Web Push payload (encrypted per RFC 8291 by `pywebpush`), JSON, max ~3 KB:

```json
{ "title": "…", "body": "…", "alertId": "…", "instrumentId": "…|null", "severity": "important" }
```

The service worker shows the notification and, on click, opens
`./#/alert/<alertId>`.

## 8. Shared instrument universe

`shared/instruments.json` is an array of `Instrument` (without user fields),
used for offline search in the PWA and for decoys in the watcher. It covers at
least DAX 40, MDAX, SDAX, TecDAX, EURO STOXX 50, the largest STOXX Europe 600
names, large US caps commonly traded on German venues, and ~150 popular UCITS
ETFs, each with ISIN and a Yahoo symbol (prefer the `.DE` XETRA listing).
