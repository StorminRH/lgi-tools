// UX capture utility — a fast, no-model-in-the-loop replacement for the Claude
// Desktop auto-verify preview loop, for UI verification only. Drives a headless
// Chromium over the running dev server, captures a full-page screenshot of each
// route at desktop + mobile, and records console errors, uncaught page errors,
// failed requests, and 4xx/5xx responses to a gitignored report. The agent reads
// that report; Ryan reviews visual + feel in his own browser. See the `ux-check`
// skill.
//
// Routes are passed as args (the caller scopes them to what the session touched),
// e.g.  `pnpm ux-check /sites /sites/30002 /`. Dynamic routes take a concrete id
// from the caller — this script never derives ids. Bare `playwright` library, not
// the @playwright/test runner: this is a dev-loop capture tool, not a test gate.

import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, assignSlugs, parseArgs, summariseResults } from './ux-capture-args.mjs';

const OUT_DIR = path.resolve(process.cwd(), 'docs/ux-check/captures');
const rel = (p) => path.relative(process.cwd(), p);

// Poll the base URL until the dev server answers (the skill may have just
// started it). Any HTTP response — even a redirect or a 500 — proves it's up.
async function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(baseUrl, { redirect: 'manual' });
      return true;
    } catch {
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 750));
    }
  }
}

// Attach diagnostic listeners before navigation; the returned object fills in
// as the page loads.
function watchPage(page) {
  const diag = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') diag.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => diag.pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    diag.failedRequests.push({ url: req.url(), error: req.failure()?.errorText ?? 'failed' });
  });
  page.on('response', (res) => {
    if (res.status() >= 400) diag.httpErrors.push({ url: res.url(), status: res.status() });
  });
  return diag;
}

// Mobile-only: open the global hamburger (revealed below 1024px) and capture it
// expanded. Best-effort — returns null where the toggle isn't present.
async function captureNavOpen(page, slug, viewport) {
  try {
    const toggle = page.locator('button.nav-menu-toggle');
    if (!(await toggle.isVisible())) return null;
    await toggle.click();
    await page.waitForTimeout(250);
    const navShot = path.join(OUT_DIR, `${slug}--${viewport}--nav-open.png`);
    await page.screenshot({ path: navShot, fullPage: true });
    return navShot;
  } catch {
    return null;
  }
}

// Navigate and let the page settle. Returns the load error message, or null.
async function gotoAndSettle(page, url, settle) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Settle, not `networkidle`: Convex's persistent websocket means idle never
    // fires on live-sync pages. A fixed wait lets streamed Suspense holes resolve.
    await page.waitForTimeout(settle);
    return null;
  } catch (err) {
    return err.message;
  }
}

// Take the base screenshot (+ mobile nav-open shot). Returns the shot paths and a
// screenshot error message if one occurred — one route's failure never aborts the
// sweep.
async function captureShots(page, slug, viewport) {
  const shots = [];
  try {
    const baseShot = path.join(OUT_DIR, `${slug}--${viewport}.png`);
    await page.screenshot({ path: baseShot, fullPage: true });
    shots.push(baseShot);
    if (viewport === 'mobile') {
      const navShot = await captureNavOpen(page, slug, viewport);
      if (navShot) shots.push(navShot);
    }
    return { shots, shotError: null };
  } catch (err) {
    return { shots, shotError: `screenshot failed: ${err.message}` };
  }
}

async function captureRoute(context, baseUrl, route, slug, viewport, settle) {
  const page = await context.newPage();
  const diag = watchPage(page);
  const url = new URL(route, baseUrl).href;

  const gotoError = await gotoAndSettle(page, url, settle);
  let captured = { shots: [], shotError: null };
  try {
    captured = await captureShots(page, slug, viewport);
  } finally {
    await page.close(); // always close the page
  }

  const loadError = gotoError ?? captured.shotError;
  return { route, viewport, url, screenshots: captured.shots.map(rel), loadError, ...diag };
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    console.error('✗ could not launch Chromium.');
    console.error(`  ${err.message}`);
    console.error('  Install the browser once: npx playwright install chromium');
    process.exit(1);
  }
}

async function runSweep(browser, routed, opts) {
  const results = [];
  try {
    for (const viewport of opts.viewports) {
      const context = await browser.newContext({ viewport: VIEWPORTS[viewport] });
      for (const { route, slug } of routed) {
        const result = await captureRoute(context, opts.baseUrl, route, slug, viewport, opts.settle);
        results.push(result);
        for (const shot of result.screenshots) console.log(`  ✓ ${shot}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

function logFindings(label, rows) {
  if (rows.length === 0) return;
  console.log(`\n⚠ ${rows.length} ${label}:`);
  for (const line of rows) console.log(`  - ${line}`);
}

function printSummary(results, reportPath) {
  const { shotCount, loadRows, consoleRows, networkRows } = summariseResults(results);
  console.log('');
  console.log(`Captured ${shotCount} screenshot(s) across ${results.length} route×viewport pair(s).`);
  console.log(`Report:  ${rel(reportPath)}`);
  console.log(`Dir:     ${rel(OUT_DIR)}/`);

  logFindings('pair(s) failed to load cleanly', loadRows);
  logFindings('pair(s) with console/page errors', consoleRows);
  logFindings('pair(s) with failed / 4xx-5xx requests', networkRows);
  if (loadRows.length + consoleRows.length + networkRows.length === 0) {
    console.log('\n✓ no console, page, or network errors observed.');
  }
}

async function main() {
  const { routes, opts } = parseArgs(process.argv.slice(2));

  console.log(`UX capture → ${opts.baseUrl}`);
  console.log(`  routes:    ${routes.join(', ')}`);
  console.log(`  viewports: ${opts.viewports.join(', ')}`);

  if (!(await waitForServer(opts.baseUrl))) {
    console.error(`✗ dev server at ${opts.baseUrl} did not respond.`);
    console.error('  Start it first (pnpm dev) or pass --base-url=…');
    process.exit(1);
  }

  // Clear so a prior run's (possibly different) route set leaves no stale shots.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  const results = await runSweep(browser, assignSlugs(routes), opts);

  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(reportPath, JSON.stringify(results, null, 2) + '\n');
  printSummary(results, reportPath);

  // A capture utility, not a gate: a clean sweep exits 0 even with findings.
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ ux-capture crashed:', err);
  process.exit(1);
});
