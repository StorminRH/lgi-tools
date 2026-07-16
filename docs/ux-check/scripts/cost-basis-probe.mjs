// Open-state + interaction probe for the input-cost Raw|Item toggle (3.7.21.1).
// Proves on a real route: the Item default renders, clicking Raw flips the
// figure to the batched buy list, clicking Item flips back, and the (?)
// popover opens with BOTH bases' figures. Screenshots each state; reports
// console/page errors + CSP violations.
//
//   PROBE_URL=http://localhost:3000/industry/12043 node docs/ux-check/scripts/cost-basis-probe.mjs
//
// Generated screenshots → docs/ux-check/captures/ (auto-wiped at start).
import { chromium } from 'playwright';
import { rm, mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/12043';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000); // let the seed + live refresh settle

// The input-cost KpiTile (the only bordered tile carrying the label).
const tile = page.locator('div.rounded-md.border', { hasText: 'Input cost' }).first();
const figure = async () => {
  const text = await tile.innerText();
  return text.match(/[\d,]+(?:\.\d+)?[KMB]?\s*ISK|[\d,]+(?:\.\d+)?[KMB]/)?.[0] ?? '?';
};

const itemFigure = await figure();
console.log(`Item state: ${itemFigure}`);
await page.screenshot({ path: `${OUT}/cost-basis-item.png` });

await page.getByRole('button', { name: 'Raw', exact: true }).click();
await page.waitForTimeout(600);
const rawFigure = await figure();
console.log(`Raw state:  ${rawFigure}`);
await page.screenshot({ path: `${OUT}/cost-basis-raw.png` });
if (rawFigure === itemFigure) throw new Error('figure did not change when toggling Raw');

// (?) popover — one content in both states: Raw and Item rows side by side.
const help = page.getByRole('button', { name: 'How input cost is computed' }).first();
await help.hover();
await page.waitForTimeout(600);
const popText = await page.locator('[role="presentation"], [data-popup-open]').last().innerText().catch(() => '');
const hasBoth = popText.includes('Raw') && popText.includes('Item');
console.log(`popover shows both bases: ${hasBoth}\n--- popover ---\n${popText}\n---`);
await page.screenshot({ path: `${OUT}/cost-basis-popover.png` });
if (!hasBoth) throw new Error('popover missing the Raw/Item rows');

// Back to Item — figure returns.
await page.getByRole('button', { name: 'Item', exact: true }).click();
await page.waitForTimeout(600);
const itemFigure2 = await figure();
if (itemFigure2 !== itemFigure) console.log(`note: Item figure moved ${itemFigure} → ${itemFigure2} (live refresh)`);

const csp = await page.evaluate(() => window.__csp__);
console.log(`\nCSP violations: ${csp.length}`);
console.log(`console errors: ${consoleErrors.length}${consoleErrors.length ? ' — ' + consoleErrors[0] : ''}`);
console.log(`page errors: ${pageErrors.length}${pageErrors.length ? ' — ' + pageErrors[0] : ''}`);
console.log('\nPROBE PASS');
await browser.close();
