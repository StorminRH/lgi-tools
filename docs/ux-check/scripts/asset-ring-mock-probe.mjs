// Visual probe for the QTY-ring fill states (3.7.7.2 refinement). The ux-check sweep
// runs logged-out, so the green arc / remaining count / completion check never appear.
// This intercepts the owned-assets endpoint and injects MOCK ownership so the three
// states render on a real route: complete (full green arc + check), partial (green arc
// + still-needed count), and barely-owned. Screenshots the plan + an open ledger.
//
//   PROBE_URL=http://localhost:3000/industry/23784 node docs/ux-check/scripts/asset-ring-mock-probe.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/23784';
const OUT = process.env.OUT_DIR ?? 'docs/ux-check/captures';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const cspViolations = [];
await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp__.push({ d: e.violatedDirective, u: e.blockedURI }),
  );
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Intercept the owned-assets POST → mock ownership keyed off the requested typeIds.
// Cycle three states so the screenshot shows all of them at once.
await page.route('**/api/industry/owned-assets', async (route) => {
  let typeIds = [];
  try {
    typeIds = JSON.parse(route.request().postData() ?? '{}').typeIds ?? [];
  } catch {}
  const assets = typeIds.map((typeId, i) => {
    // i%3: 0 → fully owned (check), 1 → ~mid green arc, 2 → small green arc.
    const ownedQty = i % 3 === 0 ? 10_000_000_000 : i % 3 === 1 ? 4000 : 120;
    return {
      typeId,
      ownedQty,
      // Two holdings to show the new labels + the conditional "·" (corp hangar has a
      // division label; the ship holding has none).
      heldBy: [
        { ownerType: 'corporation', ownerName: 'Lo-Gang', locationName: 'Upwell structure', locationFlag: 'Corp Hangar 4', quantity: Math.ceil(ownedQty * 0.7) },
        { ownerType: 'character', ownerName: 'Test Pilot', locationName: 'In a ship', locationFlag: '', quantity: Math.floor(ownedQty * 0.3) },
      ],
    };
  });
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ assets }),
  });
});

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2200); // let the overlay fetch settle + rings re-render
await page.screenshot({ path: `${OUT}/asset-ring-mock--plan.png` });

// Crisp zoomed strip of the first several rings (complete check + partial arcs).
const rings = await page.getByRole('button', { name: /asset tracking/i }).all();
if (rings.length > 0) {
  const boxes = (await Promise.all(rings.slice(0, 7).map((r) => r.boundingBox()))).filter(Boolean);
  if (boxes.length > 0) {
    const minX = Math.min(...boxes.map((b) => b.x)) - 230;
    const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + 12;
    const minY = Math.min(...boxes.map((b) => b.y)) - 6;
    const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + 6;
    await page.screenshot({
      path: `${OUT}/asset-ring-mock--rings-zoom.png`,
      clip: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    });
  }
}

// Open the first ledger popover to show Owned/Remaining + held-by filled.
const trigger = page.getByRole('button', { name: /asset tracking/i }).first();
if ((await trigger.count()) > 0) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/asset-ring-mock--ledger-open.png` });
  // Crisp clip of just the popover (located via its heading).
  const heading = page.getByText('Asset Tracking', { exact: true }).first();
  if ((await heading.count()) > 0) {
    const hb = await heading.boundingBox();
    if (hb) {
      await page.screenshot({
        path: `${OUT}/asset-ring-mock--ledger-zoom.png`,
        clip: { x: hb.x - 24, y: hb.y - 24, width: 340, height: 240 },
      });
    }
  }
}

cspViolations.push(...(await page.evaluate(() => window.__csp__ ?? [])));
const styleV = cspViolations.filter((e) => /style-src/i.test(e.d));
console.log(`style-src violations: ${styleV.length === 0 ? '0 ✓' : JSON.stringify(styleV)}`);
console.log(`page errors: ${pageErrors.length}`);
console.log(`shots → ${OUT}/asset-ring-mock--plan.png, asset-ring-mock--ledger-open.png`);

await browser.close();
process.exit(styleV.length === 0 && pageErrors.length === 0 ? 0 : 1);
