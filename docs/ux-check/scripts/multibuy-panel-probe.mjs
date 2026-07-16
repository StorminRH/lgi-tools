// Open-state probe for the Multibuy export panel (3.7.22.1).
//
// On a real planner route: opens the click-popover, checks the Net toggle
// (Total active; Remaining disabled logged-out), flips a tier checkbox and
// watches the live item count change, opens the nested (?) explainer, clicks
// Copy and verifies BOTH the toast and the actual clipboard payload
// (Name<TAB>qty lines, integer quantities, no thousand separators). Also
// collects CSP violations + console errors (Convex ws noise filtered).
//
//   PROBE_URL=http://localhost:3000/industry/23758 node docs/ux-check/scripts/multibuy-panel-probe.mjs
//
// Screenshots → docs/ux-check/captures/ (auto-wiped at the start of each run).
import { chromium } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/23758';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();

await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp__.push({ violatedDirective: e.violatedDirective, blockedURI: e.blockedURI }),
  );
});
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ws://127.0.0.1:3210')) consoleErrors.push(m.text());
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log(`multibuy panel probe → ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

// 1. Open the panel (click popover — no hover-open).
const trigger = page.getByRole('button', { name: 'Multibuy export' }).first();
if ((await trigger.count()) === 0) {
  fail('trigger "Multibuy export" not found');
} else {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.waitForTimeout(300);
  (await trigger.getAttribute('data-popup-open')) !== null
    ? ok('panel opens on click')
    : fail('panel did not open (no data-popup-open)');
}

// 2. Net toggle: Total active, Remaining disabled while logged out.
const totalBtn = page.getByRole('button', { name: 'Total', exact: true });
const remainingBtn = page.getByRole('button', { name: 'Remaining', exact: true });
(await totalBtn.getAttribute('aria-pressed')) === 'true'
  ? ok('Total is the active mode')
  : fail('Total not active by default');
(await remainingBtn.isDisabled())
  ? ok('Remaining disabled logged-out (with hint)')
  : fail('Remaining should be disabled logged-out');

// 3. Live summary + tier checkboxes.
const summaryText = async () => (await page.getByText(/\d+ items? · /).first().textContent()) ?? '';
const before = await summaryText();
ok(`summary reads "${before.trim()}"`);
const boxes = page.getByRole('checkbox', { name: /Build tier \d+/ });
const boxCount = await boxes.count();
boxCount > 1 ? ok(`${boxCount} tier checkboxes`) : fail(`expected >1 tier checkboxes, got ${boxCount}`);
await page.screenshot({ path: `${OUT}/multibuy-open--desktop.png` });
await boxes.last().click();
await page.waitForTimeout(200);
const after = await summaryText();
after !== before
  ? ok(`unchecking a tier changes the count ("${before.trim()}" → "${after.trim()}")`)
  : fail('item count did not change when a tier was unchecked');
await boxes.last().click(); // restore

// 4. The nested (?) explainer popover.
const help = page.getByRole('button', { name: 'What the multibuy export copies' }).first();
if ((await help.count()) === 0) fail('(?) explainer trigger not found');
else {
  await help.click();
  await page.waitForTimeout(300);
  (await page.getByText(/Check the tiers you.ll build yourself/).count()) > 0
    ? ok('nested (?) explainer opens inside the panel')
    : fail('nested (?) explainer did not open');
  await page.screenshot({ path: `${OUT}/multibuy-open--explainer.png` });
  await page.keyboard.press('Escape'); // close the nested popover only
  await page.waitForTimeout(200);
}

// 5. Copy → toast + clipboard payload.
const copyBtn = page.getByRole('button', { name: 'Copy', exact: true });
if ((await copyBtn.count()) === 0 || !(await copyBtn.isVisible())) {
  // Escape may have closed the whole panel — reopen.
  await trigger.click();
  await page.waitForTimeout(300);
}
await copyBtn.click();
await page.waitForTimeout(400);
(await page.getByText(/Copied \d+ items? to clipboard/).count()) > 0
  ? ok('copy shows the toast confirmation')
  : fail('no copied-confirmation toast');
await page.screenshot({ path: `${OUT}/multibuy-copied--toast.png` });

const clip = await page.evaluate(() => navigator.clipboard.readText());
const lines = clip.split('\n');
const lineRe = /^.+\t\d+$/;
lines.length > 0 && lines.every((l) => lineRe.test(l))
  ? ok(`clipboard payload: ${lines.length} Name<TAB>integer lines (first: "${lines[0]}")`)
  : fail(`clipboard payload malformed (first line: "${lines[0]}")`);
clip.includes(',') ? fail('clipboard contains a comma (thousand separator?)') : ok('no thousand separators');

// 6. Hygiene.
const csp = await page.evaluate(() => window.__csp__);
csp.length === 0 ? ok('zero CSP violations on the open state') : fail(`CSP violations: ${JSON.stringify(csp)}`);
consoleErrors.length === 0
  ? ok('zero console errors (Convex ws noise excluded)')
  : fail(`console errors: ${consoleErrors[0]}`);
pageErrors.length === 0 ? ok('zero uncaught page errors') : fail(`page errors: ${pageErrors[0]}`);

await browser.close();
console.log(process.exitCode ? '\nPROBE FAILED' : '\nPROBE PASSED');
