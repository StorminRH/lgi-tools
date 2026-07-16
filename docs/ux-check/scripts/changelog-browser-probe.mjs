// Functional probe for the changelog document browser (3.8.2.5.1 session 4).
// Verifies canonical routing, active state, layout persistence, 404s, sitemap
// coverage, shared rail scrolling, and the unchanged mobile disclosure.
//
//   node docs/ux-check/scripts/changelog-browser-probe.mjs
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.PROBE_URL ?? 'http://localhost:3000';
const OUT = 'docs/ux-check/captures';
const OLDER_SLUGS = ['v3.7', 'v3.6', 'v3.4', 'v3.3', 'v3.2', 'v3.1', 'v3.0', 'v2.9'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

function watchErrors(page) {
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
  return errors;
}

function assertNoUnexpectedErrors(errors, label) {
  const unexpected = errors.filter((error) => !/127\.0\.0\.1:3210|convex|sync/i.test(error));
  assert.deepEqual(unexpected, [], `${label} page errors: ${unexpected.join(' | ')}`);
}

async function settle(page) {
  await page.waitForTimeout(300);
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/changelog`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);

  const navItems = page.locator('.content-browser-nav-item');
  assert.equal(await navItems.count(), 9, 'rail should list all nine masters');
  assert.match(await page.locator('[aria-current="page"]').textContent(), /^v3\.8\b/);
  assert.equal(await page.locator('[aria-current="page"]').getAttribute('href'), '/changelog');
  assert.equal(await page.locator('.changelog-master-ver:visible').textContent(), 'v3.8');
  await page.locator('.content-browser-rail').evaluate((rail) => {
    rail.dataset.probeLayout = 'persisted';
  });
  await page.screenshot({ path: `${OUT}/changelog-browser--desktop-landing.png`, fullPage: true });

  await page.locator('a[href="/changelog/v3.7"]').click();
  await page.waitForURL('**/changelog/v3.7');
  await settle(page);
  assert.match(await page.locator('[aria-current="page"]').textContent(), /^v3\.7\b/);
  assert.equal(await page.locator('.changelog-master-ver:visible').textContent(), 'v3.7');
  assert.equal(
    await page.locator('.content-browser-rail').getAttribute('data-probe-layout'),
    'persisted',
    'shared changelog layout should survive soft navigation',
  );
  assert.match(await page.title(), /v3\.7.*Changelog/i);
  await page.screenshot({ path: `${OUT}/changelog-browser--desktop-v3.7.png`, fullPage: true });

  for (const slug of ['v3.8', 'v9.9']) {
    const response = await page.request.get(`${BASE}/changelog/${slug}`);
    assert.equal(response.status(), 404, `${slug} should return 404`);
  }

  const sitemap = await page.request.get(`${BASE}/sitemap.xml`);
  assert.equal(sitemap.ok(), true, 'sitemap should load');
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /<loc>[^<]+\/changelog<\/loc>/);
  for (const slug of OLDER_SLUGS) {
    assert.match(sitemapXml, new RegExp(`<loc>[^<]+/changelog/${slug.replace('.', '\\.')}<\\/loc>`));
  }
  assert.doesNotMatch(sitemapXml, /<loc>[^<]+\/changelog\/v3\.8<\/loc>/);

  assertNoUnexpectedErrors(errors, 'desktop');
  console.log('[desktop] landing, soft navigation, active state, metadata, 404s, sitemap: PASS');
  await context.close();
}

async function runCompactDesktop() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 300 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/changelog/v3.7`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);

  const rail = page.locator('.content-browser-rail');
  const body = page.locator('.content-browser-rail-body');
  const initialTop = await rail.evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(initialTop > 24, 'rail should begin below its sticky stop');
  await page.evaluate((top) => window.scrollTo(0, top), initialTop);
  await settle(page);
  const stuckTop = await rail.evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(Math.abs(stuckTop - 24) <= 2, `rail should stick at 24px, got ${stuckTop}`);

  const dimensions = await body.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert.ok(dimensions.scrollHeight > dimensions.clientHeight, 'compact rail should overflow');
  await body.hover();
  const windowBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 180);
  await settle(page);
  assert.ok((await body.evaluate((element) => element.scrollTop)) > 0, 'wheel should scroll rail');
  assert.equal(await page.evaluate(() => window.scrollY), windowBefore, 'page should remain still');

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await body.hover();
  const chainBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 180);
  await settle(page);
  assert.ok((await page.evaluate(() => window.scrollY)) > chainBefore, 'rail boundary should chain');
  await page.screenshot({ path: `${OUT}/changelog-browser--desktop-compact.png` });

  assertNoUnexpectedErrors(errors, 'compact desktop');
  console.log('[compact desktop] sticky, internal scroll, boundary chaining: PASS');
  await context.close();
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BASE}/changelog/v3.7`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);

  const rail = page.locator('.content-browser-rail');
  const toggle = page.locator('.content-browser-rail-toggle');
  assert.equal(await rail.evaluate((element) => getComputedStyle(element).position), 'static');
  assert.equal(await toggle.isVisible(), true, 'mobile version disclosure should be visible');
  await toggle.click();
  assert.equal(await rail.getAttribute('open'), null, 'mobile disclosure should close');
  await toggle.click();
  assert.equal(await rail.getAttribute('open'), '', 'mobile disclosure should reopen');
  assert.match(await page.locator('[aria-current="page"]').textContent(), /^v3\.7\b/);
  await page.screenshot({ path: `${OUT}/changelog-browser--mobile-v3.7.png`, fullPage: true });

  assertNoUnexpectedErrors(errors, 'mobile');
  console.log('[mobile] disclosure and active state: PASS');
  await context.close();
}

try {
  await runDesktop();
  await runCompactDesktop();
  await runMobile();
} finally {
  await browser.close();
}
