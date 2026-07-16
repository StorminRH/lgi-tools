// One-off mock probe — show the owned-blueprint orb + popover without a login.
// Intercepts POST /api/industry/owned-blueprints and returns a realistic mix of
// owned blueprints (ME + the 3.7.5.5 readout detail: TE / owner / location) for the
// requested blueprint type ids, so the build plan renders the glowing-blue corner
// orbs and the popover shows the full detail. Then proves the popover opens
// CSP-clean and screenshots both the grid of orbs and an open popover.
//
//   node owned-orb-probe.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/industry/23758'; // Archon (capital — many buildable components)
const OUT = 'docs/ux-check/captures';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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

// A varied owner/location mix so the popover detail rows have realistic content,
// including a player structure (degraded to "Upwell structure" server-side — here
// the mock just returns the label the real resolver would).
const PROVENANCE = [
  { ownerType: 'character', ownerName: 'Test Pilot', locationName: 'Jita IV-4 — Caldari Navy Assembly Plant', locationFlag: 'Hangar' },
  { ownerType: 'corporation', ownerName: 'Lo-Gang Industries', locationName: 'Upwell structure', locationFlag: 'CorpSAG1' },
  { ownerType: 'character', ownerName: 'Test Pilot', locationName: 'Amarr VIII (Oris) — Emperor Family Academy', locationFlag: 'Hangar' },
];

// Mock the owned-blueprints read: own ~3 of every 4 requested blueprints, with a
// varied ME/TE + owner/location so the popover content has the full detail shape
// (matches the OwnedBlueprintMeEntry contract — required fields, or apiFetch's Zod
// validation rejects the response and no orbs render).
await page.route('**/api/industry/owned-blueprints', async (route) => {
  const body = JSON.parse(route.request().postData() ?? '{}');
  const ids = body.blueprintTypeIds ?? [];
  const blueprints = ids
    .map((blueprintTypeId, i) => {
      const me = [10, 9, 8, 0][i % 4];
      if (me <= 0) return null;
      return { blueprintTypeId, me, te: [20, 18, 16][i % 3], ...PROVENANCE[i % PROVENANCE.length] };
    })
    .filter(Boolean);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ blueprints }),
  });
});

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// The re-laid-out node cards (3.7.5.7): inline ME/TE fields, QTY rings, drill-down.
const meFields = page.locator('input[aria-label*="material efficiency"]');
const teFields = page.locator('input[aria-label*="time efficiency"]');
const rings = page.locator('[aria-label*="needed"]');
const meCount = await meFields.count();
console.log(`ME fields: ${meCount} · TE fields: ${await teFields.count()} · QTY rings: ${await rings.count()}`);

await page.screenshot({ path: `${OUT}/orb-buildplan--desktop.png`, fullPage: true });

// Edit a field (type a value) → it should commit + colour orange (manual override).
let edited = false;
if (meCount > 0) {
  const f = meFields.first();
  await f.scrollIntoViewIfNeeded();
  await f.fill('3');
  await page.waitForTimeout(300);
  edited = (await f.inputValue()) === '3';
}
console.log(`field edit committed: ${edited}`);

// Hover a QTY ring → owner / location / needed.
let ringText = '';
if ((await rings.count()) > 0) {
  await rings.first().hover();
  await page.waitForTimeout(450);
  ringText = (await page.locator('[role="dialog"]').first().innerText().catch(() => '')) || '';
  await page.screenshot({ path: `${OUT}/node-ring-hover--desktop.png` });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
}
console.log(`ring hover: ${JSON.stringify(ringText.replace(/\s+/g, ' ').trim().slice(0, 140))}`);

// Drill-down still works: click a manufacturable card body → it focuses (aria-pressed).
const cards = page.locator('[role="button"][aria-pressed]');
let drilled = false;
if ((await cards.count()) > 0) {
  const c = cards.first();
  await c.scrollIntoViewIfNeeded();
  await c.click({ position: { x: 80, y: 8 } }); // the name area, not a field/ring
  await page.waitForTimeout(300);
  drilled = (await c.getAttribute('aria-pressed')) === 'true';
}
console.log(`drill-down focuses card: ${drilled}`);

// The "Total job time" KPI card + the existing "Build time".
const kpiText = (await page.locator('body').innerText().catch(() => '')) || '';
console.log(`has "Build time" KPI: ${/Build time/i.test(kpiText)} · has "Total job time" KPI: ${/Total job time/i.test(kpiText)}`);
const csp = await page.evaluate(() => window.__csp__ ?? []);
console.log(`CSP violations: ${csp.length}`, csp.slice(0, 5));
console.log(`console errors: ${consoleErrors.length}`, consoleErrors.slice(0, 3));
console.log(`page errors: ${pageErrors.length}`, pageErrors.slice(0, 3));

await browser.close();
console.log('done');
