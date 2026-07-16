// Open-state probe for the devlog code excerpts (v3.8.2.4). The `pnpm ux-check`
// sweep captures only the CLOSED <details>; this opens every excerpt on a real
// route and proves the OPEN state: syntax-highlighted token spans render, the
// line-number gutter shows, the "view on GitHub" permalink appears on pinned
// excerpts, and the inline per-token `style` colour triggers ZERO style-src CSP
// violations. Screenshots the permalink-bearing excerpt close-up + a full page.
//
//   node docs/ux-check/scripts/devlog-excerpt-open-probe.mjs
import { chromium, devices } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const BASE = process.env.PROBE_URL ?? 'http://localhost:3000';
const OUT = 'docs/ux-check/captures';
const ROUTES = ['/devlog/neon', '/devlog/search'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function run(tag, device) {
  const ctx = await browser.newContext(
    device ? { ...devices[device] } : { viewport: { width: 1440, height: 900 } },
  );
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__csp__ = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__csp__.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);

    const opened = await page.$$eval('details.devlog-excerpt', (els) => {
      els.forEach((d) => (d.open = true));
      return els.length;
    });
    const permalinks = await page.$$eval('.devlog-excerpt-permalink a', (as) =>
      as.map((a) => a.getAttribute('href')),
    );
    const coloredTokens = await page.$$eval('.devlog-excerpt-code-line span[style]', (s) => s.length);
    const gutters = await page.$$eval('.devlog-excerpt-gutter', (g) => g.length);
    await page.waitForTimeout(300);

    const slug = route.replace(/\//g, '_');
    const target = page
      .locator('details.devlog-excerpt', { has: page.locator('.devlog-excerpt-permalink') })
      .first();
    if (await target.count()) {
      await target.scrollIntoViewIfNeeded();
      await target.screenshot({ path: `${OUT}/open-permalink${slug}--${tag}.png` });
    }

    const csp = await page.evaluate(() => window.__csp__);
    const nonConvex = errors.filter((e) => !/127\.0\.0\.1:3210|convex|sync/i.test(e));
    console.log(
      `[${tag}] ${route}: opened=${opened} gutters=${gutters} coloredTokenSpans=${coloredTokens} permalinks=${permalinks.length} cspViolations=${csp.length} nonConvexErrors=${nonConvex.length}`,
    );
    if (permalinks.length) console.log(`   permalink → ${permalinks[0]}`);
    if (csp.length) console.log('   CSP:', csp.slice(0, 3));
    if (nonConvex.length) console.log('   ERR:', nonConvex.slice(0, 3));
    await page.close();
  }
  await ctx.close();
}

await run('desktop', null);
await run('mobile', 'iPhone 13');
await browser.close();
