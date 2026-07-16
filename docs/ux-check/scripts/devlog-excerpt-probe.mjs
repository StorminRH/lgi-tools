// Open-state probe for the /devlog inline code excerpts + nav folders (native
// <details>). `pnpm ux-check` captures only the collapsed shell; this proves an
// excerpt expands in place (code renders), collapses again, a nav folder toggles,
// and the open state is CSP-clean.
//
//   node docs/ux-check/scripts/devlog-excerpt-probe.mjs
//
// Does NOT wipe docs/ux-check/captures/ (keeps the sweep shots); writes one shot.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/devlog/convex';
const OUT = 'docs/ux-check/captures';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__csp__ = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp__.push({ d: e.violatedDirective, u: e.blockedURI }),
  );
});
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);

const details = page.locator('.devlog-excerpt').first();
const summary = page.locator('.devlog-excerpt > summary').first();
const before = await details.evaluate((el) => el.open);
await summary.scrollIntoViewIfNeeded();
await summary.click();
await page.waitForTimeout(300);
const after = await details.evaluate((el) => el.open);
const codeText = await details.locator('pre code').first().innerText();
await page.screenshot({ path: `${OUT}/devlog-excerpt-open--desktop.png` });
await summary.click();
await page.waitForTimeout(200);
const collapsed = await details.evaluate((el) => el.open);

const folder = page.locator('.devlog-nav-folder').first();
const folderBefore = await folder.evaluate((el) => el.open);
await page.locator('.devlog-nav-folder > summary').first().click();
await page.waitForTimeout(200);
const folderAfter = await folder.evaluate((el) => el.open);

const csp = await page.evaluate(() => window.__csp__ ?? []);
const styleV = csp.filter((c) => /style-src/i.test(c.d));
const nonConvexConsole = consoleErrors.filter((e) => !e.includes('3210'));

console.log('excerpt open  before/after/collapsed:', before, after, collapsed);
console.log('code first line:', JSON.stringify(codeText.split('\n')[0].slice(0, 70)), `(len ${codeText.length})`);
console.log('nav folder toggle before/after:', folderBefore, folderAfter);
console.log('style-src CSP violations:', styleV.length, JSON.stringify(styleV));
console.log('non-Convex console errors:', nonConvexConsole.length, JSON.stringify(nonConvexConsole.slice(0, 3)));
console.log('page errors:', pageErrors.length, JSON.stringify(pageErrors));

await browser.close();
const ok =
  before === false &&
  after === true &&
  collapsed === false &&
  codeText.length > 0 &&
  folderBefore === true &&
  folderAfter === false &&
  styleV.length === 0 &&
  pageErrors.length === 0;
console.log(ok ? '\n✓ CLEAN — excerpt expands+collapses in place, code renders, folder toggles, CSP-clean' : '\n✗ see output');
process.exit(ok ? 0 : 1);
