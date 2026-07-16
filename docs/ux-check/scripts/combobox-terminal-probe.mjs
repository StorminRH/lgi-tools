// Combobox primitive — TerminalSearch open-state probe (C3, 3.8.2.5.1).
//
// The planner's build-system field is a TerminalSearch (now on the shared Base UI
// Combobox). Only shows in the UNPICKED state (no saved build location) — logged
// out there is none, so it renders. Proves: the field renders, typeahead populates
// grouped/flat suggestions from the systems source, ArrowDown highlights a row,
// Enter/click selects it (the field swaps to the picked-system box), Esc closes,
// the input shows a SINGLE focus ring on keyboard Tab (outline:none via
// .field-own-focus), and zero CSP / page errors.
//
//   PROBE_URL=http://localhost:3000/industry/681 node docs/ux-check/scripts/combobox-terminal-probe.mjs
//
// Shots → docs/ux-check/captures/ (auto-wiped at start).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/681';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';
const PLACEHOLDER = 'Build system — type a name';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp__ = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
    );
  });
  const consoleErrors = [];
  // Convex live-sync WS failures are environmental (backend not running under bare
  // `pnpm dev`) and unrelated to the combobox — filter them out.
  const isNoise = (t) => /ws:\/\/127\.0\.0\.1:3210|ERR_CONNECTION_REFUSED|convex/i.test(t);
  page.on('console', (m) => m.type() === 'error' && !isNoise(m.text()) && consoleErrors.push(m.text()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`\n[${tag}] → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);

  const input = page.getByPlaceholder(PLACEHOLDER).first();
  const present = (await input.count()) > 0;
  console.log(`  field present: ${present ? '✓' : '✗ (unpicked build-system field not found)'}`);
  if (!present) {
    await page.screenshot({ path: `${OUT}/combobox-terminal--${tag}--NOFIELD.png`, fullPage: true });
    await page.close();
    return { ok: false };
  }

  // Single focus ring FIRST (needs a pristine, un-clicked field). Real keyboard Tab
  // — .focus() would not set :focus-visible (the C2 lesson). Tab from the body until
  // the build-system input is the active element, then read its outline.
  await page.keyboard.press('Tab');
  let ring = 'n/a';
  for (let i = 0; i < 60; i++) {
    if (await input.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  if (await input.evaluate((el) => el === document.activeElement)) {
    ring = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      return JSON.stringify({
        focusVisible: el.matches(':focus-visible'),
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
      });
    });
    await page.screenshot({ path: `${OUT}/combobox-terminal--${tag}--focus-ring.png` });
  }
  console.log(`  keyboard-focus ring (outline none = single ring): ${ring}`);

  // Typeahead
  await input.fill('jita');
  await page.waitForTimeout(700);
  const options = page.getByRole('option');
  const optCount = await options.count();
  const firstOptText = optCount > 0 ? (await options.first().innerText()).trim() : '(none)';
  console.log(`  suggestions after "jita": ${optCount} (first: "${firstOptText}")`);
  await page.screenshot({ path: `${OUT}/combobox-terminal--${tag}--open.png` });

  // Keyboard: ArrowDown highlights a row
  await input.press('ArrowDown');
  await page.waitForTimeout(250);
  const highlighted = await page.locator('[role="option"][data-highlighted]').count();
  console.log(`  ArrowDown → highlighted rows: ${highlighted} ${highlighted > 0 ? '✓' : '✗'}`);
  await page.screenshot({ path: `${OUT}/combobox-terminal--${tag}--highlighted.png` });

  // Esc closes the list WITHOUT selecting (Escape while open dismisses).
  await input.press('Escape');
  await page.waitForTimeout(300);
  const escClosed = (await page.getByRole('option').count()) === 0;
  const fieldSurvivesEsc = (await page.getByPlaceholder(PLACEHOLDER).count()) > 0;
  console.log(`  Esc → list closed: ${escClosed ? '✓' : '✗'} | field still present: ${fieldSurvivesEsc ? '✓' : '✗'}`);

  // Enter on a highlighted row selects → field swaps to the picked-system box.
  await input.fill('jita');
  await page.waitForTimeout(600);
  await input.press('ArrowDown');
  await page.waitForTimeout(200);
  await input.press('Enter');
  await page.waitForTimeout(900);
  const stillThere = (await page.getByPlaceholder(PLACEHOLDER).count()) > 0;
  console.log(`  Enter on highlight → picked (search field replaced): ${!stillThere ? '✓' : '✗ still showing input'}`);
  await page.screenshot({ path: `${OUT}/combobox-terminal--${tag}--after-select.png` });

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  console.log(`  style-src CSP violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  real console errors: ${consoleErrors.length} | page errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log('   pageErrors:', pageErrors.slice(0, 3));
  if (consoleErrors.length) console.log('   consoleErrors:', consoleErrors.slice(0, 3));

  await page.close();
  return {
    ok: present && optCount > 0 && highlighted > 0 && escClosed && !stillThere && styleV.length === 0 && pageErrors.length === 0,
  };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop');
const mobile = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const r2 = await probe(mobile, 'mobile');
await browser.close();
console.log(`\n${r1.ok && r2.ok ? `✓ TerminalSearch combobox OK (desktop+mobile). Shots in ${OUT}/` : '✗ see output above'}`);
process.exit(r1.ok && r2.ok ? 0 : 1);
