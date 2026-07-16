// TEMPLATE — open-state overlay probe (copy + tweak the URL/labels per feature).
//
// `pnpm ux-check` captures only the CLOSED static shell. This opens an overlay
// (hover + tap + keyboard) on a REAL route so Base UI's Positioner writes its
// inline placement style, then proves: zero style-src CSP violations on the open
// state, keyboard operability (Enter opens a popover, Escape closes), touch-open,
// and screenshots the open overlay. Detect "open" via the trigger's
// `data-popup-open` (Base UI popups carry no role="tooltip"; the positioner is
// role="presentation").
//
//   PROBE_URL=http://localhost:3000/industry/691 node docs/ux-check/scripts/overlay-open-probe.mjs
//
// Generated screenshots → docs/ux-check/captures/ (auto-wiped at start of each run).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/691';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';
// Per-feature: the accessible names of the trigger buttons to open. Override via
// PROBE_LABELS="Label A|Label B".
const LABELS = (process.env.PROBE_LABELS ??
  'How the Market Score is calculated|How build time is estimated').split('|');

// Auto-wipe: each capture run leaves only its own latest shots (no storage creep).
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function probe(ctx, tag, { tapTest }) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp__ = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
    );
  });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`\n[${tag}] → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  let opened = 0;
  for (const label of LABELS) {
    const t = page.getByRole('button', { name: label }).first();
    if ((await t.count()) === 0) {
      console.log(`  – "${label}": trigger not present (skipped)`);
      continue;
    }
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (tapTest) {
      await t.scrollIntoViewIfNeeded();
      await t.tap();
    } else {
      await t.hover();
    }
    await page.waitForTimeout(400);
    const open = (await t.getAttribute('data-popup-open')) !== null;
    if (open) {
      await page.screenshot({ path: `${OUT}/overlay-open--${tag}--${slug}.png` });
      opened++;
    }
    let kb = '(tap)';
    if (!tapTest) {
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await t.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(350);
      const openEnter = (await t.getAttribute('data-popup-open')) !== null;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      const closedEsc = (await t.getAttribute('data-popup-open')) === null;
      kb = `enter-opens=${openEnter} escape-closes=${closedEsc}`;
    }
    console.log(`  ${open ? '✓' : '✗'} "${label}" opens=${open} | ${kb}`);
  }

  const csp = await page.evaluate(() => window.__csp__ ?? []);
  const styleV = csp.filter((e) => /style-src/i.test(e.violatedDirective));
  const other = csp.filter(
    (e) => !styleV.includes(e) && !/va\.vercel-scripts\.com/i.test(e.blockedURI ?? ''),
  );
  console.log(`  style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
  console.log(`  other CSP violations: ${other.length === 0 ? '0 ✓' : JSON.stringify(other)}`);
  console.log(`  console errors: ${consoleErrors.length} | page errors: ${pageErrors.length}`);
  await page.close();
  return { opened, clean: styleV.length === 0 && other.length === 0 && pageErrors.length === 0 };
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r1 = await probe(desktop, 'desktop', { tapTest: false });
const mobile = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const r2 = await probe(mobile, 'mobile', { tapTest: true });

await browser.close();
const ok = r1.clean && r2.clean && r1.opened > 0 && r2.opened > 0;
console.log(`\n${ok ? `✓ CLEAN — opened desktop+mobile, CSP clean. Shots in ${OUT}/` : '✗ see output'}`);
process.exit(ok ? 0 : 1);
