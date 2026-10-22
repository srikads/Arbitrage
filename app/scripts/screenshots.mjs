// Takes screenshots of key screens in demo mode (fictional data) at mobile and
// desktop widths. Requires a running dev server (npm run dev) and Playwright.
// Usage: BASE_URL=http://localhost:5173/ node scripts/screenshots.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(resolve(root, 'noop.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots');
mkdirSync(OUT, { recursive: true });

const RHM = 'DE0007030009';
const shots = [
  ['portfolio', '#/'],
  ['instrument', `#/i/${RHM}`],
  ['signals', '#/signals'],
  ['alert', '#/alert/al-1'],
  ['digest', '#/digest/dg-1'],
  ['add', '#/add'],
  ['ask', '#/ask'],
  ['settings', '#/settings'],
];

const sizes = [
  ['mobile', { width: 390, height: 844 }, 3],
  ['desktop', { width: 1440, height: 900 }, 1],
];

const only = process.argv[2];
const browser = await chromium.launch();
for (const [label, viewport, dpr] of sizes) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr === 3 ? 2 : 1,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  for (const [name, hash] of shots) {
    if (only && only !== name) continue;
    await page.goto(`${BASE}?demo=1${hash}`, { waitUntil: 'networkidle' });
    if (name === 'add') {
      await page.fill('input[type=search]', 'siemens');
    }
    await page.waitForTimeout(600);
    const file = resolve(OUT, `${label}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('saved', file);
    if (label === 'mobile' && (name === 'portfolio' || name === 'instrument')) {
      await page.screenshot({ path: resolve(OUT, `${label}-${name}-full.png`), fullPage: true });
    }
  }
  // Onboarding + unlock (no demo): fresh storage.
  if (!only || only === 'onboarding') {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${label}-onboarding.png`) });
    // Create a throwaway local vault, then show step 2 and the unlock screen.
    const pass = 'demo screenshot vault phrase';
    const pw = page.locator('input[type=password]');
    await pw.nth(0).fill(pass);
    await pw.nth(1).fill(pass);
    await page.getByLabel('I have stored my passphrase safely').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Connect your repository').waitFor({ timeout: 20000 });
    await page.screenshot({ path: resolve(OUT, `${label}-onboarding-repo.png`) });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Unlock Arbitrage').waitFor();
    await page.screenshot({ path: resolve(OUT, `${label}-unlock.png`) });
    console.log('saved onboarding + unlock');
  }
  await ctx.close();
}
await browser.close();
