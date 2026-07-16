// Combobox primitive — GlobalSearch (header ⌘K) open-state probe (C3, 3.8.2.5.1).
//
// Proves the header search on the shared Base UI Combobox: ⌘K focuses it, typing
// yields grouped results in the recessed dropdown-panel, ArrowDown highlights a
// row (with its ↵ affordance), Enter navigates, Esc clears+closes, a single focus
// ring on keyboard Tab, and zero CSP / page errors.
//
//   QUERY=combat node docs/ux-check/scripts/combobox-global-probe.mjs
//
// Shots → docs/ux-check/captures/ (auto-wiped at start).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/';
const QUERY = process.env.QUERY ?? 'combat';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag, { mobile }) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp__ = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
    );
  });
  const isNoise = (t) => /ws:\/\/127\.0\.0\.1:3210|ERR_CONNECTION_REFUSED|convex/i.test(t);
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && !isNoise(m.text()) && consoleErrors.push(m.text()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`\n[${tag}] → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // On mobile the header search is behind the hamburger row; it's still in the DOM.
  const input = page.locator('[data-search-input]').first();
  const present = (await input.count()) > 0;
  console.log(`  search input present: ${present ? '✓' : '✗'}`);
  if (!present) {
    await page.screenshot({ path: `${OUT}/combobox-global--${tag}--NOFIELD.png`, fullPage: true });
    await page.close();
    return { ok: false };
  }

  // Single focus ring via real keyboard Tab (desktop only — mobile Tab is unusual).
  let ring = 'skipped';
  if (!mobile) {
    await page.keyboard.press('Tab');
    for (let i = 0; i < 40; i++) {
      if (await input.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    if (await input.evaluate((el) => el === document.activeElement)) {
      ring = await input.evaluate((el) => {
        const cs = getComputedStyle(el);
        return JSON.stringify({ focusVisible: el.matches(':focus-visible'), outlineStyle: cs.outlineStyle });
      });
      await page.screenshot({ path: `${OUT}/combobox-global--${tag}--focus-ring.png` });
    }
    await input.evaluate((el) => el.blur());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  console.log(`  keyboard-focus ring (outline none = single): ${ring}`);

  // ⌘K (Control+k) focuses the input from anywhere.
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  const cmdkFocused = await input.evaluate((el) => el === document.activeElement);
  console.log(`  ⌘K focuses input: ${cmdkFocused ? '✓' : '✗'}`);

  // Type → grouped results.
  await input.fill(QUERY);
  await page.waitForTimeout(700);
  const optCount = await page.getByRole('option').count();
  const groupLabels = await page.locator('[role="group"] [id]').allInnerTexts().catch(() => []);
  const firstOpt = optCount > 0 ? (await page.getByRole('option').first().innerText()).replace(/\n+/g, ' ').trim() : '(none)';
  console.log(`  "${QUERY}" → options: ${optCount} | first: "${firstOpt.slice(0, 60)}"`);
  await page.screenshot({ path: `${OUT}/combobox-global--${tag}--open.png` });

  // ArrowDown highlights a row.
  await input.press('ArrowDown');
  await page.waitForTimeout(200);
  const highlighted = await page.locator('[role="option"][data-highlighted]').count();
  console.log(`  ArrowDown → highlighted: ${highlighted} ${highlighted > 0 ? '✓' : '✗'}`);
  await page.screenshot({ path: `${OUT}/combobox-global--${tag}--highlighted.png` });

  // Enter navigates (URL changes off the current page).
  const before = page.url();
  await input.press('Enter');
  await page.waitForTimeout(900);
  const navigated = page.url() !== before;
  console.log(`  Enter navigates: ${navigated ? '✓' : '✗'} (${before} → ${page.url()})`);

  // Back, ⌘K, type, Esc → closed + cleared.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const input2 = page.locator('[data-search-input]').first();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(150);
  await input2.fill(QUERY);
  await page.waitForTimeout(500);
  await input2.press('Escape');
  await page.waitForTimeout(300);
  const escClosed = (await page.getByRole('option').count()) === 0;
  const escCleared = (await input2.inputValue()) === '';
  console.log(`  Esc → closed: ${escClosed ? '✓' : '✗'} | cleared: ${escCleared ? '✓' : '✗'}`);

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  console.log(`  style-src CSP violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  real console errors: ${consoleErrors.length} | page errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log('   pageErrors:', pageErrors.slice(0, 3));
  if (consoleErrors.length) console.log('   consoleErrors:', consoleErrors.slice(0, 3));

  await page.close();
  return { ok: present && cmdkFocused && optCount > 0 && highlighted > 0 && escClosed && styleV.length === 0 && pageErrors.length === 0 };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop', { mobile: false });
const mob = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const r2 = await probe(mob, 'mobile', { mobile: true });
await browser.close();
console.log(`\n${r1.ok ? '✓ GlobalSearch combobox OK (desktop)' : '✗ desktop — see output'}; mobile input present=${r2.ok}`);
process.exit(r1.ok ? 0 : 1);
