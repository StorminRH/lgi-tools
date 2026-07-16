// Verifies the wired ME adjuster on the REAL planner, logged-out, by mocking the
// owned-blueprints response (the orbs are gated on owning a researched BP). Proves:
// orbs render on buildable rows + the main-BP control, the control opens, the plan
// RECOMPUTES on an ME override (price-independent material quantities change), and
// the open state is CSP-clean. Run against localhost (the allowed dev origin, so
// hydration completes).
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/29987';
const MAIN_BP = 29987; // Legion blueprint
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp__.push({ d: e.violatedDirective, b: e.blockedURI }),
  );
});
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Mock owned ME: own the main BP at ME10 + every other requested component at ME 5–10,
// leaving the rest unowned — so the plan is ME-active and shows a mix of gems.
await page.route('**/api/industry/owned-blueprints', async (route) => {
  const body = route.request().postDataJSON();
  const ids = (body && body.blueprintTypeIds) || [];
  const mes = [5, 8, 10, 7];
  const blueprints = ids
    .filter((_, i) => i % 2 === 0)
    .map((bp, i) => ({ blueprintTypeId: bp, me: bp === MAIN_BP ? 10 : mes[i % 4] }));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blueprints }) });
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(4000);

const orbs = await page.getByRole('button', { name: /— set material efficiency/ }).count();
const mainCtl = await page.getByRole('button', { name: 'Main blueprint — set material efficiency' }).count();
console.log('adjuster triggers:', orbs, '| main-BP control present:', mainCtl === 1);

// Recompute proof: capture price-independent material quantities, drop the main-BP
// ME to 0 (raises the top inputs' draw), recapture — the quantity set must change.
const qtys = async () => (await page.getByText(/^×\s/).allInnerTexts()).join('|');
const before = await qtys();
const main = page.getByRole('button', { name: 'Main blueprint — set material efficiency' }).first();
await main.click();
await page.waitForTimeout(300);
const opened = (await main.getAttribute('data-popup-open')) !== null;
const dialog = page.locator('[role=dialog]').last();
await dialog.locator('input[type=number]').fill('0');
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const after = await qtys();
const recomputed = before.length > 0 && before !== after;
console.log('main control opened:', opened, '| plan recomputed on ME override:', recomputed);

const csp = await page.evaluate(() => window.__csp__ || []);
const styleV = csp.filter((e) => /style-src/i.test(e.d));
const realConsole = consoleErrors.filter((m) => !/webpack-hmr|status of 404/.test(m));
console.log('style-src CSP violations:', styleV.length, '| console errors:', realConsole.length, '| page errors:', pageErrors.length);

await page.screenshot({ path: 'docs/ux-check/captures/planner-orbs.png' });
await browser.close();
const ok = orbs > 0 && mainCtl === 1 && opened && recomputed && styleV.length === 0 && pageErrors.length === 0;
console.log(ok ? '\n✓ WIRED — orbs render, control opens, plan recomputes, CSP clean' : '\n✗ see output');
process.exit(ok ? 0 : 1);
