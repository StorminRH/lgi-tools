// OOB.2.1 throwaway CSP probe — opens each Base UI overlay and records every
// SecurityPolicyViolation event + console message. `ux-check` captures the static
// shell but never opens an overlay, so this is the decisive proof that Base UI's
// internally-set positioner inline-style renders CSP-clean under the post-OOB.1.1
// `style-src 'self' 'unsafe-inline'`. Lives in gitignored docs/ → never committed.
//
//   pnpm exec next dev -H 127.0.0.1   # in another shell
//   node docs/csp-probe.mjs
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/dev/sandbox/overlays';

const browser = await chromium.launch();
const page = await browser.newPage();

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

// Open each overlay so its Positioner writes its inline placement style. Close
// (Escape) between modal/dismissible ones so they don't overlap.
async function open(name, fn) {
  try {
    await fn();
    await page.waitForTimeout(500);
    console.log(`  ✓ opened ${name}`);
  } catch (err) {
    console.log(`  ✗ could not open ${name}: ${err.message}`);
  }
}

await open('Tooltip', async () => {
  await page.getByRole('button', { name: 'Hover me' }).hover();
});
await open('Popover', async () => {
  await page.getByRole('button', { name: 'Open popover' }).click();
});
await page.keyboard.press('Escape');
await open('Menu', async () => {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.keyboard.press('ArrowDown');
});
await page.keyboard.press('Escape');
await open('Dialog', async () => {
  await page.getByRole('button', { name: 'Open dialog' }).click();
});
await page.waitForTimeout(300);
await page.keyboard.press('Escape');

const csp = await page.evaluate(() => window.__csp__ ?? []);

// The thing this session proves: zero style-src violations (Base UI's positioner
// inline style must be permitted). Separate that from the known, pre-existing,
// dev-only script-src block on Vercel Speed Insights' debug script (root layout,
// every route) — not a Base UI issue and out of scope here.
const styleViolations = csp.filter((e) => /style-src/i.test(e.violatedDirective));
const speedInsights = csp.filter((e) => /va\.vercel-scripts\.com/i.test(e.blockedURI ?? ''));
const otherViolations = csp.filter(
  (e) => !styleViolations.includes(e) && !speedInsights.includes(e),
);

console.log('\n=== SecurityPolicyViolation events by directive ===');
const byDir = {};
for (const e of csp) byDir[e.violatedDirective] = (byDir[e.violatedDirective] ?? 0) + 1;
console.log(csp.length === 0 ? '  (none)' : JSON.stringify(byDir, null, 2));

console.log('\n=== style-src violations (MUST be zero — the Base UI proof) ===');
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
  `\n${clean ? '✓ CLEAN — zero style-src violations; overlays render CSP-clean' : '✗ unexpected CSP violations'}`,
);
process.exit(clean ? 0 : 1);
