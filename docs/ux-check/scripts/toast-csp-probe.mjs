// OOB.3.2 — sonner toast fix proof: scroll-stability + CSP-clean, fired through
// the SHIPPED path (the ambient LoadingToastProvider → @/components/ui/toast →
// sonner), on the /dev/sandbox/toast harness.
//
// `pnpm ux-check` captures only the CLOSED static shell. This drives the real
// provider-fired sync so sonner's runtime style injection is live, then proves:
//   1. SCROLL-STABILITY (the OOB.3 fix): with the toast on screen, scrolling the
//      page does NOT move it — sonner's portal toaster is viewport-fixed and
//      decoupled from the flow header by construction, so the old strip's
//      scroll-detach cannot recur. We assert the toast's getBoundingClientRect()
//      is unchanged across an 800px scroll and that [data-sonner-toaster] is
//      position:fixed.
//   2. CSP-clean: zero style-src violations (sonner styles via its own injected
//      stylesheet + our className map, permitted by the post-OOB.1.1 style-src),
//      zero other CSP violations, zero page errors — while toasts are on screen.
//
//   node docs/ux-check/scripts/toast-csp-probe.mjs
//   PROBE_BASE=http://localhost:3000 node docs/ux-check/scripts/toast-csp-probe.mjs
//
// Shots → docs/ux-check/captures/toast-probe/ (only THIS subdir is wiped per run,
// so a `pnpm ux-check` sweep's captures in the parent dir survive — run the sweep
// first, then this probe last).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const TOAST_URL = `${BASE}/dev/sandbox/toast`;
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures/toast-probe';
const SCROLL_BY = 800;

// Only wipe this probe's own subdir, so a prior ux-check sweep's shots survive.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function rectOf(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-sonner-toast]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left) };
  });
}

async function probe(ctx, tag) {
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

  console.log(`\n[${tag}] → ${TOAST_URL}`);
  await page.goto(TOAST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);

  // Context: the header is in normal document flow (root-layout component) — the
  // exact condition that decoupled the OLD fixed strip on scroll. The fix is that
  // the new toast is NOT coupled to it at all.
  const headerPos = await page.evaluate(() => {
    const h = document.querySelector('.app-header');
    return h ? getComputedStyle(h).position : '(no .app-header found)';
  });

  // Fire the provider-driven sync (toggle stays up). This is the real path:
  // useLoadingToast(busy) → LoadingToastProvider → @/components/ui/toast.
  const runSync = page.getByRole('button', { name: 'Run sync', exact: true }).first();
  await runSync.click();
  let fired = false;
  try {
    await page.waitForSelector('[data-sonner-toast]', { timeout: 5000 });
    fired = true;
  } catch {
    console.log('  ✗ no [data-sonner-toast] appeared after "Run sync"');
  }
  await page.waitForTimeout(500); // settle the enter animation

  const toasterPos = await page.evaluate(() => {
    const t = document.querySelector('[data-sonner-toaster]');
    return t ? getComputedStyle(t).position : '(none)';
  });

  // Rect before scroll → screenshot → scroll → rect after → screenshot.
  const before = await rectOf(page);
  await page.screenshot({ path: `${OUT}/sonner-toast--${tag}--top.png` });
  await page.evaluate((y) => window.scrollBy(0, y), SCROLL_BY);
  await page.waitForTimeout(500);
  const scrollY = await page.evaluate(() => Math.round(window.scrollY));
  const after = await rectOf(page);
  await page.screenshot({ path: `${OUT}/sonner-toast--${tag}--scrolled.png` });

  const stayedPut =
    !!before &&
    !!after &&
    Math.abs(before.top - after.top) <= 1 &&
    Math.abs(before.left - after.left) <= 1;

  console.log(`  [evidence] .app-header position = "${headerPos}" (flow-positioned)`);
  console.log(
    `  [fix] [data-sonner-toaster] position = "${toasterPos}" ` +
      `${toasterPos === 'fixed' ? '✓ viewport-fixed' : '✗ NOT fixed'}`,
  );
  console.log(
    `  [scroll] scrolled ${scrollY}px — toast viewport top ` +
      `${before?.top}→${after?.top}, left ${before?.left}→${after?.left} ⇒ ` +
      `${stayedPut ? 'STAYS PUT ✓' : 'MOVED ✗'}`,
  );

  // Auto-dismiss: toggle the sync off → the keyed toast swaps to "synced" with a
  // FINITE duration and must disappear (the bug Ryan hit was it inheriting the
  // loading toast's Infinity and sticking forever, even across navigation).
  const stopSync = page.getByRole('button', { name: 'Stop sync', exact: true }).first();
  let dismissed = false;
  if ((await stopSync.count()) > 0) {
    await stopSync.scrollIntoViewIfNeeded();
    await stopSync.click();
    await page.waitForTimeout(3200); // comfortably > SYNC_DONE_MS + the exit animation
    dismissed = (await page.locator('[data-sonner-toast]').count()) === 0;
  }
  console.log(
    `  [auto-dismiss] sync toast after toggle-off + 3.2s: ` +
      `${dismissed ? 'GONE ✓' : 'STILL PRESENT ✗'}`,
  );

  // One-off success + error for extra CSP coverage (the general surface).
  for (const name of ['Show success', 'Show error']) {
    const b = page.getByRole('button', { name, exact: true }).first();
    if ((await b.count()) > 0) {
      await b.scrollIntoViewIfNeeded();
      await b.click();
      await page.waitForTimeout(250);
    }
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
  return {
    clean: styleV.length === 0 && other.length === 0 && pageErrors.length === 0,
    fired,
    stayedPut,
    fixed: toasterPos === 'fixed',
    dismissed,
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
const ok =
  r1.clean && r2.clean &&
  r1.fired && r2.fired &&
  r1.stayedPut && r2.stayedPut &&
  r1.fixed && r2.fixed &&
  r1.dismissed && r2.dismissed;
console.log(
  ok
    ? `\n✓ CLEAN — provider-fired sync toast stays put on scroll (desktop+mobile), ` +
        `viewport-fixed, auto-dismisses after sync, zero CSP violations. Shots in ${OUT}/`
    : '\n✗ see output above',
);
process.exit(ok ? 0 : 1);
