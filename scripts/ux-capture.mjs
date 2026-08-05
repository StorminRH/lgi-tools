// UX log sweep — headless Chromium over the running app for changed routes.
// Assertion surface is status + console + page errors + network diagnostics.
// Screenshots only when a route×viewport fails (written under
// docs/ux-check/captures/). Agents do not visually approve the UI; the operator
// does after the log report. See docs/workflows/ux-check.md.

import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, assignSlugs, parseArgs, summariseResults } from './ux-capture-args.mjs';
import { loadRemoteAuthOptions } from './ux-remote-auth.mjs';

const OUT_DIR = path.resolve(process.cwd(), 'docs/ux-check/captures');
const rel = (p) => path.relative(process.cwd(), p);

const STANDARD_CONSOLE_NOISE = [
  /ws:\/\/127\.0\.0\.1:3210/i,
  /127\.0\.0\.1:3210.*ERR_CONNECTION_REFUSED/i,
  /ERR_CONNECTION_REFUSED.*127\.0\.0\.1:3210/i,
  /\bconvex\b/i,
  /webpack-hmr/i,
  /\[Fast Refresh\]/i,
  /va\.vercel-scripts\.com/i,
];

function isAllowedConsole(message) {
  return STANDARD_CONSOLE_NOISE.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(message);
  });
}

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

function watchPage(page) {
  const diag = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isAllowedConsole(text)) diag.consoleErrors.push(text);
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

async function gotoAndSettle(page, url, settle) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(settle);
    return null;
  } catch (err) {
    return err.message;
  }
}

async function maybeFailureShot(page, slug, viewport, failed) {
  if (!failed) return [];
  try {
    const file = path.join(OUT_DIR, `${slug}--${viewport}--failure.png`);
    await page.screenshot({ path: file, fullPage: true });
    return [rel(file)];
  } catch (err) {
    return [`screenshot failed: ${err.message}`];
  }
}

function routeFailed(result) {
  return Boolean(
    result.loadError || result.consoleErrors.length > 0 || result.pageErrors.length > 0,
  );
}

function emptyResult(route, viewport, url) {
  return {
    route,
    viewport,
    url,
    loadError: null,
    failureArtifacts: [],
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
  };
}

async function probeRoute(context, baseUrl, route, slug, viewport, settle) {
  const page = await context.newPage();
  const diag = watchPage(page);
  const url = new URL(route, baseUrl).href;
  const result = { ...emptyResult(route, viewport, url), loadError: await gotoAndSettle(page, url, settle), ...diag };
  try {
    const artifacts = await maybeFailureShot(page, slug, viewport, routeFailed(result));
    const shotError = artifacts.find((item) => item.startsWith('screenshot failed:'));
    result.failureArtifacts = artifacts.filter((item) => !item.startsWith('screenshot failed:'));
    result.screenshots = result.failureArtifacts;
    if (shotError) result.loadError = result.loadError ?? shotError;
  } finally {
    await page.close();
  }
  return result;
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

async function openAuthContext(browser, viewport, auth) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    ...(auth.storageState ? { storageState: auth.storageState } : {}),
    ...(auth.extraHTTPHeaders ? { extraHTTPHeaders: auth.extraHTTPHeaders } : {}),
  });
  if (auth.cookies.length > 0) await context.addCookies(auth.cookies);
  return context;
}

function logRouteResult(result) {
  const mark = routeFailed(result) ? '✗' : '✓';
  console.log(`  ${mark} ${result.route} [${result.viewport}]`);
  for (const artifact of result.failureArtifacts) {
    console.log(`      failure artifact: ${artifact}`);
  }
}

async function runSweep(browser, routed, opts, auth) {
  const results = [];
  try {
    for (const viewport of opts.viewports) {
      const context = await openAuthContext(browser, viewport, auth);
      for (const { route, slug } of routed) {
        const result = await probeRoute(context, opts.baseUrl, route, slug, viewport, opts.settle);
        results.push(result);
        logRouteResult(result);
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
  const { failureArtifactCount, loadRows, consoleRows, networkRows } = summariseResults(results);
  console.log('');
  console.log(
    `Probed ${results.length} route×viewport pair(s); ${failureArtifactCount} failure artifact(s).`,
  );
  console.log(`Report:  ${rel(reportPath)}`);
  console.log(`Dir:     ${rel(OUT_DIR)}/`);
  logFindings('pair(s) failed to load cleanly', loadRows);
  logFindings('pair(s) with console/page errors', consoleRows);
  logFindings('pair(s) with failed / 4xx-5xx requests (disposition required)', networkRows);
  if (loadRows.length + consoleRows.length + networkRows.length === 0) {
    console.log('\n✓ no console, page, or network errors observed.');
  }
  console.log('\nOperator visual checklist: open each probed route in your browser and confirm layout/feel.');
}

function authLabel(opts, auth) {
  if (opts.storageState || opts.cookieJar || auth.extraHTTPHeaders) return 'configured';
  return 'anonymous';
}

async function prepareOutDir() {
  await rm(path.join(OUT_DIR, 'report.json'), { force: true });
  await mkdir(OUT_DIR, { recursive: true });
}

async function main() {
  const { routes, opts } = parseArgs(process.argv.slice(2));
  const auth = await loadRemoteAuthOptions({
    storageState: opts.storageState,
    cookieJar: opts.cookieJar,
  });

  console.log(`UX log sweep → ${opts.baseUrl}`);
  console.log(`  routes:    ${routes.join(', ')}`);
  console.log(`  viewports: ${opts.viewports.join(', ')}`);
  console.log(`  auth:      ${authLabel(opts, auth)}`);

  if (!(await waitForServer(opts.baseUrl))) {
    console.error(`✗ server at ${opts.baseUrl} did not respond.`);
    console.error('  Start it first (pnpm dev) or pass --base-url=…');
    process.exit(1);
  }

  await prepareOutDir();
  const results = await runSweep(await launchBrowser(), assignSlugs(routes), opts, auth);
  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  printSummary(results, reportPath);
  process.exit(results.some(routeFailed) ? 1 : 0);
}

main().catch((err) => {
  console.error('✗ ux-capture crashed:', err);
  process.exit(1);
});
