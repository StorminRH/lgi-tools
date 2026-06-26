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

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const OUT_DIR = path.resolve(process.cwd(), '.ux-captures');
const rel = (p) => path.relative(process.cwd(), p);

// --- args -------------------------------------------------------------------
// Positionals are route paths; `--flag=value` are options. No args → smoke `/`.
function applyFlag(opts, key, value) {
  if (key === 'base-url') opts.baseUrl = value;
  else if (key === 'settle') {
    const n = Number(value);
    if (!Number.isNaN(n)) opts.settle = n; // allow --settle=0 (0 is valid, not "unset")
  } else if (key === 'viewport' || key === 'viewports') {
    opts.viewports = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v in VIEWPORTS);
  } else console.error(`  (ignoring unknown flag --${key})`);
}

function parseArgs(argv) {
  const routes = [];
  const opts = {
    baseUrl: process.env.UX_BASE_URL ?? 'http://127.0.0.1:3000',
    viewports: ['desktop', 'mobile'],
    settle: 1500,
  };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value = ''] = arg.slice(2).split('=');
      applyFlag(opts, key, value);
    } else {
      routes.push(arg.startsWith('/') ? arg : `/${arg}`);
    }
  }
  if (routes.length === 0) {
    routes.push('/');
    console.error("ℹ no routes passed — capturing '/' as a smoke check.");
    console.error('  normally you pass the routes this session touched, e.g.');
    console.error('  pnpm ux-check /sites /sites/30002 /industry');
  }
  if (opts.viewports.length === 0) opts.viewports = ['desktop', 'mobile'];
  return { routes, opts };
}

// `/` → home; `/sites/[id]` → sites-id; trailing/leading slashes collapsed.
function slugify(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
  return s || 'home';
}

// Pair each route with a unique filename slug. slugify() collapses every
// separator run to one `-`, so routes differing only in punctuation (`/a/b` vs
// `/a-b`) would otherwise share a file and silently overwrite each other —
// disambiguate collisions with a numeric suffix.
function assignSlugs(routes) {
  const used = new Set();
  return routes.map((route) => {
    const base = slugify(route);
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return { route, slug };
  });
}

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
    const toggle = page.locator('summary.nav-menu-toggle');
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

async function captureRoute(context, baseUrl, route, slug, viewport, settle) {
  const page = await context.newPage();
  const diag = watchPage(page);
  const url = new URL(route, baseUrl).href;

  let loadError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Settle, not `networkidle`: Convex's persistent websocket means idle never
    // fires on live-sync pages. A fixed wait lets streamed Suspense holes resolve.
    await page.waitForTimeout(settle);
  } catch (err) {
    loadError = err.message;
  }

  // Always close the page (finally), and don't let one route's screenshot
  // failure abort the rest of the sweep — record it and move on.
  const shots = [];
  try {
    const baseShot = path.join(OUT_DIR, `${slug}--${viewport}.png`);
    await page.screenshot({ path: baseShot, fullPage: true });
    shots.push(baseShot);
    if (viewport === 'mobile') {
      const navShot = await captureNavOpen(page, slug, viewport);
      if (navShot) shots.push(navShot);
    }
  } catch (err) {
    loadError = loadError ?? `screenshot failed: ${err.message}`;
  } finally {
    await page.close();
  }

  return { route, viewport, url, screenshots: shots.map(rel), loadError, ...diag };
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

function networkFirst(r) {
  return r.httpErrors[0]
    ? `${r.httpErrors[0].status} ${r.httpErrors[0].url}`
    : `${r.failedRequests[0].error} ${r.failedRequests[0].url}`;
}

function logFindings(label, rows) {
  if (rows.length === 0) return;
  console.log(`\n⚠ ${rows.length} ${label}:`);
  for (const line of rows) console.log(`  - ${line}`);
}

function printSummary(results, reportPath) {
  const shotCount = results.reduce((n, r) => n + r.screenshots.length, 0);
  console.log('');
  console.log(`Captured ${shotCount} screenshot(s) across ${results.length} route×viewport pair(s).`);
  console.log(`Report:  ${rel(reportPath)}`);
  console.log(`Dir:     ${rel(OUT_DIR)}/`);

  const loadRows = results
    .filter((r) => r.loadError)
    .map((r) => `${r.route} [${r.viewport}]: ${r.loadError}`);
  const consoleRows = results
    .filter((r) => r.consoleErrors.length || r.pageErrors.length)
    .map((r) => {
      const msgs = [...r.consoleErrors, ...r.pageErrors];
      return `${r.route} [${r.viewport}]: ${msgs.length} — ${msgs[0]}`;
    });
  const networkRows = results
    .filter((r) => r.failedRequests.length || r.httpErrors.length)
    .map((r) => `${r.route} [${r.viewport}]: ${r.failedRequests.length + r.httpErrors.length} — ${networkFirst(r)}`);

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
