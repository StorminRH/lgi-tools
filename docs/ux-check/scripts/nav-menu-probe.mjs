// OOB.2.4 nav hamburger probe — the open/close-on-navigate proof the sweep can't do.
//
// `pnpm ux-check` opens the hamburger and screenshots the OPEN state, but never
// taps a link to prove the menu closes itself on navigation (the headline
// behaviour: the header persists across client navs, so a Menu.LinkItem
// `closeOnClick` is what keeps it from staying open on the new page). This drives
// the real mobile flow and asserts: tap-open, close-on-link-tap + actual route
// change, keyboard Enter-open / Escape-close, and zero style-src CSP violations.
//
//   PROBE_URL=http://localhost:3000/ node docs/ux-check/scripts/nav-menu-probe.mjs
//
// Screenshots → docs/ux-check/captures/ (auto-wiped at start of each run).
import { chromium, devices } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const TARGET = process.env.PROBE_URL ?? 'http://localhost:3000/';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
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

const r = {};
const toggle = () => page.locator('button.nav-menu-toggle');
const isOpen = async () => (await toggle().getAttribute('data-popup-open')) !== null;

console.log(`\n[nav-menu] → ${TARGET} (mobile 390×844, touch)`);
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);

r.triggerVisible = await toggle().isVisible();

// 1) tap-open
await toggle().tap();
await page.waitForTimeout(350);
r.openOnTap = await isOpen();
r.panelVisible = await page.locator('.nav-menu-panel').isVisible().catch(() => false);
await page.screenshot({ path: `${OUT}/nav-menu--mobile--open.png` });

// 2) close-on-link-tap (+ real navigation)
const sitesLink = page.locator('.nav-menu-panel a.nav-tool', { hasText: 'Wormhole Sites' });
r.linkPresent = (await sitesLink.count()) > 0;
await sitesLink.first().tap();
await page.waitForURL('**/sites', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);
r.navigatedTo = new URL(page.url()).pathname;
r.closedAfterNav = !(await isOpen());
r.panelGoneAfterNav = (await page.locator('.nav-menu-panel').count()) === 0;
await page.screenshot({ path: `${OUT}/nav-menu--mobile--after-link-tap.png` });

// 3) keyboard: Enter opens, Escape closes (same persistent header, now on /sites)
await toggle().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
r.openOnEnter = await isOpen();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
r.closedOnEscape = !(await isOpen());

// CSP + errors
const csp = await page.evaluate(() => window.__csp__ ?? []);
r.styleSrcViolations = csp.filter((e) => /style-src/i.test(e.violatedDirective)).length;
r.consoleErrors = consoleErrors.length;
r.pageErrors = pageErrors.length;

await page.close();
await browser.close();

console.log(JSON.stringify(r, null, 2));
const ok =
  r.triggerVisible &&
  r.openOnTap &&
  r.panelVisible &&
  r.linkPresent &&
  r.navigatedTo === '/sites' &&
  r.closedAfterNav &&
  r.panelGoneAfterNav &&
  r.openOnEnter &&
  r.closedOnEscape &&
  r.styleSrcViolations === 0 &&
  r.pageErrors === 0;
console.log(
  `\n${ok ? '✓ CLEAN — tap-open, close-on-link-tap+navigate, Enter-open, Escape-close, CSP clean' : '✗ see results above'}`,
);
process.exit(ok ? 0 : 1);
