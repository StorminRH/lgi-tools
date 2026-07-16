// Open-state probe for the saved-templates popover (3.7.23) + the ?plan=
// loader's logged-out arm. The scripted sweep captures only the closed shell;
// this opens the panel on a real route and proves, logged out:
//   1. click-open via the accessible trigger name, Escape-close
//   2. the signed-out empty state ("Sign in to save build templates")
//   3. the save 401 arm — type a name, Save, expect the error toast
//   4. /industry/692?plan=<unknown> → the keyed not-found toast fires and the
//      plan param is stripped from the URL (history.replaceState)
// plus zero style-src CSP violations on every open state.
//
//   node docs/ux-check/scripts/templates-menu-probe.mjs
//
// Generated screenshots → docs/ux-check/captures/ (auto-wiped at start).
import { chromium } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const BASE = process.env.PROBE_URL ?? 'http://localhost:3000/industry/692';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
  );
});
const consoleErrors = [];
page.on('console', (m) => {
  // Known-noise baseline: the Convex WS retries (backend not running locally)
  // and the browser's own log of the 401 this probe DELIBERATELY triggers in
  // the signed-out save arm.
  if (
    m.type() === 'error' &&
    !m.text().includes('ws://127.0.0.1:3210') &&
    !m.text().includes('status of 401')
  ) {
    consoleErrors.push(m.text());
  }
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};

// ── 1+2: open the panel, signed-out empty state ─────────────────────────
console.log(`\n[panel] → ${BASE}`);
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);

const trigger = page.getByRole('button', { name: 'Saved templates' }).first();
check((await trigger.count()) === 1, 'trigger present in the head cluster');
await trigger.click();
await page.waitForTimeout(400);
check(
  (await trigger.getAttribute('data-popup-open')) !== null,
  'panel opens on click (data-popup-open)',
);
check(
  (await page.getByText('Sign in to save build templates').count()) === 1,
  'signed-out empty state shown',
);
await page.screenshot({ path: `${OUT}/templates-menu-open.png` });

// ── 3: the save 401 arm ─────────────────────────────────────────────────
const nameInput = page.getByRole('textbox', { name: 'Template name' });
await nameInput.fill('Probe template');
const saveButton = page.getByRole('button', { name: 'Save', exact: true });
check(await saveButton.isEnabled(), 'Save enables once a name is typed');
await saveButton.click();
const errToast = page.locator('[data-sonner-toast]', {
  hasText: 'Sign in to save build templates',
});
await errToast.waitFor({ timeout: 5000 }).catch(() => {});
check((await errToast.count()) === 1, 'save while signed out surfaces the 401 toast');
await page.screenshot({ path: `${OUT}/templates-menu-save-401.png` });

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(
  (await trigger.getAttribute('data-popup-open')) === null,
  'Escape closes the panel',
);

// ── 4: the ?plan= loader's not-found arm + param strip ──────────────────
const planUrl = `${BASE}?plan=probe-does-not-exist`;
console.log(`\n[loader] → ${planUrl}`);
await page.goto(planUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
const nfToast = page.locator('[data-sonner-toast]', {
  hasText: 'Saved template not found',
});
await nfToast.waitFor({ timeout: 12000 }).catch(() => {});
check((await nfToast.count()) === 1, 'unknown plan id fires the keyed not-found toast');
await page.screenshot({ path: `${OUT}/template-loader-not-found.png` });
await page.waitForTimeout(300);
const search = await page.evaluate(() => window.location.search);
check(!search.includes('plan='), `plan param stripped after handling (search="${search}")`);

// ── wrap-up ──────────────────────────────────────────────────────────────
const csp = await page.evaluate(() => window.__csp__);
check(csp.length === 0, `zero CSP violations (${csp.length})`);
check(pageErrors.length === 0, `zero uncaught page errors (${pageErrors.length})`);
check(consoleErrors.length === 0, `zero non-Convex console errors (${consoleErrors.length})`);
if (consoleErrors.length > 0) console.log('    first:', consoleErrors[0]);

await browser.close();
console.log(failures === 0 ? '\nAll probe checks passed.' : `\n${failures} probe check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
