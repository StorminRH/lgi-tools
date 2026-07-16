// OOB.4.1 throwaway CSP probe — drives the mapper spike (React Flow node graph +
// dnd-kit reorder) and records every SecurityPolicyViolation event + console
// message. `ux-check` captures the static shell but never drags a node, so this
// is the decisive proof that React Flow's per-frame inline transforms and
// dnd-kit's drag transforms render CSP-clean under the post-OOB.1.1
// `style-src 'self' 'unsafe-inline'`. Lives in gitignored docs/ → never committed.
//
//   pnpm exec next dev -H 127.0.0.1   # in another shell
//   node docs/ux-check/scripts/mapper-csp-probe.mjs
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/dev/sandbox/mapper';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });

// Collect CSP violations the moment the document dispatches them.
await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp__.push({
      violatedDirective: e.violatedDirective,
      blockedURI: e.blockedURI,
      sourceFile: e.sourceFile,
      lineNumber: e.lineNumber,
    });
  });
});

const consoleMsgs = [];
page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(800);

// Drive each interaction so the libraries write their inline transforms: React
// Flow repositions a node + pans/zooms the viewport; dnd-kit drags a row.
async function step(name, fn) {
  try {
    await fn();
    await page.waitForTimeout(400);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

async function drag(box, dx, dy) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
}

await step('drag a graph node', async () => {
  const node = page.locator('.react-flow__node').first();
  await node.waitFor({ timeout: 5000 });
  const box = await node.boundingBox();
  await drag(box, 90, 70);
});

await step('zoom the viewport', async () => {
  const pane = page.locator('.react-flow__pane').first();
  const box = await pane.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
});

await step('reorder a signature row', async () => {
  const row = page.locator('.sbx-sortable').first();
  await row.waitFor({ timeout: 5000 });
  const box = await row.boundingBox();
  await drag(box, 0, 100);
});

const csp = await page.evaluate(() => window.__csp__ ?? []);

// The thing this spike proves: zero style-src violations (React Flow's + dnd-kit's
// inline transforms must be permitted). Separate that from the known, pre-existing,
// dev-only script-src block on Vercel Speed Insights' debug script (root layout,
// every route) — not a mapper issue and out of scope here.
const styleViolations = csp.filter((e) => /style-src/i.test(e.violatedDirective));
const speedInsights = csp.filter((e) => /va\.vercel-scripts\.com/i.test(e.blockedURI ?? ''));
const otherViolations = csp.filter(
  (e) => !styleViolations.includes(e) && !speedInsights.includes(e),
);

console.log('\n=== SecurityPolicyViolation events by directive ===');
const byDir = {};
for (const e of csp) byDir[e.violatedDirective] = (byDir[e.violatedDirective] ?? 0) + 1;
console.log(csp.length === 0 ? '  (none)' : JSON.stringify(byDir, null, 2));

console.log('\n=== style-src violations (MUST be zero — the renderer proof) ===');
console.log(styleViolations.length === 0 ? '  (none) ✓' : JSON.stringify(styleViolations, null, 2));

console.log('\n=== known pre-existing, out-of-scope (Vercel Speed Insights, dev-only script-src) ===');
console.log(speedInsights.length === 0 ? '  (none)' : JSON.stringify(speedInsights, null, 2));

console.log('\n=== any OTHER violations ===');
console.log(otherViolations.length === 0 ? '  (none) ✓' : JSON.stringify(otherViolations, null, 2));

console.log('\n=== Full console log ===');
if (consoleMsgs.length === 0) console.log('  (empty)');
for (const m of consoleMsgs) console.log(`  [${m.type}] ${m.text}`);

console.log('\n=== Uncaught page errors ===');
console.log(pageErrors.length === 0 ? '  (none)' : pageErrors.map((e) => `  ${e}`).join('\n'));

await browser.close();

// PASS = zero style-src violations and nothing unexpected beyond the known
// Speed Insights script-src block.
const clean = styleViolations.length === 0 && otherViolations.length === 0;
console.log(
  `\n${clean ? '✓ CLEAN — zero style-src violations; mapper renders CSP-clean' : '✗ unexpected CSP violations'}`,
);
process.exit(clean ? 0 : 1);
