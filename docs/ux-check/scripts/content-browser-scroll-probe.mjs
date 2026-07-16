// Functional probe for the shared ContentBrowser rail (3.8.2.5.1 session 3).
// Verifies desktop sticky-follow, independent scrolling, boundary chaining,
// short-rail behavior, and the unchanged mobile disclosure.
//
//   node docs/ux-check/scripts/content-browser-scroll-probe.mjs
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.PROBE_URL ?? 'http://localhost:3000';
const OUT = 'docs/ux-check/captures';
const ROUTE = '/devlog/vercel';
const STICKY_INSET = 24;
const TOLERANCE = 2;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

function near(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${message}: expected ${expected}±${TOLERANCE}, got ${actual}`,
  );
}

async function settle(page) {
  await page.waitForTimeout(250);
}

async function railMetrics(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.content-browser-rail');
    const body = document.querySelector('.content-browser-rail-body');
    if (!(rail instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error('content-browser rail not found');
    }
    const railRect = rail.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const railStyle = getComputedStyle(rail);
    const bodyStyle = getComputedStyle(body);
    return {
      windowY: window.scrollY,
      viewportHeight: window.innerHeight,
      railTop: railRect.top,
      railBottom: railRect.bottom,
      railPosition: railStyle.position,
      bodyTop: bodyRect.top,
      bodyBottom: bodyRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      bodyMaxHeight: bodyStyle.maxHeight,
      bodyOverflowY: bodyStyle.overflowY,
      bodyOverscrollY: bodyStyle.overscrollBehaviorY,
    };
  });
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);

  const initial = await railMetrics(page);
  assert.equal(initial.railPosition, 'sticky');
  assert.equal(initial.bodyOverflowY, 'auto');
  assert.equal(initial.bodyOverscrollY, 'auto');
  assert.ok(initial.bodyScrollHeight > initial.bodyClientHeight, 'desktop rail should overflow');
  assert.ok(initial.railTop > STICKY_INSET + TOLERANCE, 'rail should begin below its sticky stop');

  const followDistance = Math.min(40, (initial.railTop - STICKY_INSET) / 2);
  await page.evaluate((distance) => window.scrollTo(0, distance), followDistance);
  await settle(page);
  const following = await railMetrics(page);
  near(following.railTop, initial.railTop - followDistance, 'rail should follow page before sticking');

  await page.evaluate(
    ({ railTop, inset }) => window.scrollTo(0, railTop - inset + 80),
    { railTop: initial.railTop, inset: STICKY_INSET },
  );
  await settle(page);
  const stuck = await railMetrics(page);
  near(stuck.railTop, STICKY_INSET, 'tall rail should stick at the top inset');
  assert.ok(
    stuck.railBottom <= stuck.viewportHeight - STICKY_INSET + TOLERANCE,
    'stuck rail should remain fully inside the viewport',
  );

  const body = page.locator('.content-browser-rail-body');
  await body.hover();
  const beforeInternal = await railMetrics(page);
  await page.mouse.wheel(0, 500);
  await settle(page);
  const afterInternal = await railMetrics(page);
  assert.ok(afterInternal.bodyScrollTop > beforeInternal.bodyScrollTop, 'wheel should scroll the rail');
  near(afterInternal.windowY, beforeInternal.windowY, 'internal rail scroll should not move the page');
  await page.screenshot({ path: `${OUT}/content-browser-rail--desktop-scrolled.png` });

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await settle(page);
  const lastLinkVisible = await page.locator('.content-browser-nav-item').last().evaluate((link) => {
    const bodyElement = link.closest('.content-browser-rail-body');
    if (!(bodyElement instanceof HTMLElement)) return false;
    const linkRect = link.getBoundingClientRect();
    const bodyRect = bodyElement.getBoundingClientRect();
    return linkRect.top >= bodyRect.top - 1 && linkRect.bottom <= bodyRect.bottom + 1;
  });
  assert.equal(lastLinkVisible, true, 'last navigation item should be reachable');

  const beforeChain = await railMetrics(page);
  await body.hover();
  await page.mouse.wheel(0, 500);
  await settle(page);
  const afterChain = await railMetrics(page);
  assert.ok(afterChain.windowY > beforeChain.windowY, 'wheel at the rail boundary should scroll the page');

  await page.locator('.content-browser-nav-group').evaluateAll((groups) => {
    for (const group of groups) group.open = false;
  });
  await body.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  const shortInitial = await railMetrics(page);
  assert.ok(
    shortInitial.bodyScrollHeight <= shortInitial.bodyClientHeight + TOLERANCE,
    'collapsed rail should fit without internal scrolling',
  );

  await page.evaluate(
    ({ railTop, inset }) => window.scrollTo(0, railTop - inset + 80),
    { railTop: shortInitial.railTop, inset: STICKY_INSET },
  );
  await settle(page);
  const shortStuck = await railMetrics(page);
  near(shortStuck.railTop, STICKY_INSET, 'short rail should pin after the header clears');
  await page.screenshot({ path: `${OUT}/content-browser-rail--desktop-short.png` });

  const nonConvexErrors = errors.filter((error) => !/127\.0\.0\.1:3210|convex|sync/i.test(error));
  assert.deepEqual(nonConvexErrors, [], `desktop page errors: ${nonConvexErrors.join(' | ')}`);
  console.log('[desktop] sticky-follow, internal scroll, chaining, reachability, and short rail: PASS');
  console.log(
    `  initialTop=${initial.railTop.toFixed(1)} stuckTop=${stuck.railTop.toFixed(1)} ` +
      `body=${stuck.bodyClientHeight}/${stuck.bodyScrollHeight} maxHeight=${stuck.bodyMaxHeight}`,
  );
  await context.close();
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  const initial = await railMetrics(page);
  assert.equal(initial.railPosition, 'static');
  assert.equal(initial.bodyOverflowY, 'visible');
  assert.equal(initial.bodyMaxHeight, 'none');

  const rail = page.locator('.content-browser-rail');
  const toggle = page.locator('.content-browser-rail-toggle');
  assert.equal(await toggle.isVisible(), true, 'mobile rail toggle should be visible');
  assert.equal(await rail.getAttribute('open'), '', 'mobile rail should start open');
  await toggle.click();
  assert.equal(await rail.getAttribute('open'), null, 'mobile rail should close');
  await toggle.click();
  assert.equal(await rail.getAttribute('open'), '', 'mobile rail should reopen');
  await page.screenshot({ path: `${OUT}/content-browser-rail--mobile-open.png`, fullPage: true });

  const nonConvexErrors = errors.filter((error) => !/127\.0\.0\.1:3210|convex|sync/i.test(error));
  assert.deepEqual(nonConvexErrors, [], `mobile page errors: ${nonConvexErrors.join(' | ')}`);
  console.log('[mobile] non-sticky disclosure open/close: PASS');
  await context.close();
}

try {
  await runDesktop();
  await runMobile();
} finally {
  await browser.close();
}
