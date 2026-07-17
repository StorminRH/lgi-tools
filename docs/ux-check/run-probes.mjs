// run-probes.mjs — the one probe runner for docs/ux-check.
// Owns browser lifecycle, console/pageerror/CSP/network collection, noise
// policy, screenshots, report.json, and the pass/fail exit gate. A probe is a
// definition module in docs/ux-check/probes/ (see README for the format);
// definitions receive everything through ctx and import nothing from here.
// Default gates on every probe: zero style-src CSP violations and zero
// unfiltered console/page errors. Never waits on networkidle: the Convex
// websocket keeps the network busy forever.

import { chromium, devices } from 'playwright';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPORTS } from '../../scripts/ux-capture-args.mjs';

const ROOT = process.cwd();
const DEFINITIONS_DIR = path.resolve(ROOT, 'docs/ux-check/probes');
const OUT_DIR = path.resolve(ROOT, 'docs/ux-check/captures/probes');
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
const DEFAULT_SETTLE_MS = 1000;
const DEFAULT_VIEWPORTS = ['desktop', 'mobile'];
const STANDARD_CONSOLE_NOISE = [
  /ws:\/\/127\.0\.0\.1:3210/i,
  /127\.0\.0\.1:3210.*ERR_CONNECTION_REFUSED/i,
  /ERR_CONNECTION_REFUSED.*127\.0\.0\.1:3210/i,
  /\bconvex\b/i,
  /webpack-hmr/i,
  /\[Fast Refresh\]/i,
  /va\.vercel-scripts\.com/i,
];

const rel = (file) => path.relative(ROOT, file);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const names = [];
  const opts = {
    baseUrl: process.env.UX_BASE_URL ?? 'http://localhost:3000',
    list: false,
  };
  for (const arg of argv) {
    if (arg === '--list') opts.list = true;
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else names.push(arg);
  }
  return { names, opts };
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(baseUrl, { redirect: 'manual' });
      return true;
    } catch {
      if (Date.now() > deadline) return false;
      await wait(750);
    }
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isAllowedConsole(message, extraPatterns) {
  return [...STANDARD_CONSOLE_NOISE, ...extraPatterns].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(message);
  });
}

function watchPage(page, allowConsole) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
  };
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !isAllowedConsole(text, allowConsole)) {
      diagnostics.consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? 'failed',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
    }
  });
  return diagnostics;
}

async function installCspCollector(page) {
  await page.addInitScript(() => {
    window.__uxProbeCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__uxProbeCsp.push({
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
  });
}

function contextOptions(viewport) {
  if (viewport === 'mobile') {
    return {
      ...devices['Pixel 7'],
      viewport: VIEWPORTS.mobile,
      hasTouch: true,
      isMobile: true,
    };
  }
  return { viewport: VIEWPORTS.desktop };
}

function validateDefinition(definition, filename) {
  if (!definition || typeof definition !== 'object') {
    throw new Error(`${filename}: default export must be an object`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.name ?? '')) {
    throw new Error(`${filename}: name must be a kebab-case string`);
  }
  if (typeof definition.route !== 'string' || definition.route.length === 0) {
    throw new Error(`${filename}: route must be a non-empty string`);
  }
  if (typeof definition.run !== 'function') {
    throw new Error(`${filename}: run(ctx) must be a function`);
  }
  const viewports = definition.viewports ?? DEFAULT_VIEWPORTS;
  if (
    !Array.isArray(viewports)
    || viewports.length === 0
    || viewports.some((viewport) => !(viewport in VIEWPORTS))
  ) {
    throw new Error(`${filename}: viewports must contain desktop and/or mobile`);
  }
  const allowConsole = definition.allowConsole ?? [];
  if (!Array.isArray(allowConsole) || allowConsole.some((pattern) => !(pattern instanceof RegExp))) {
    throw new Error(`${filename}: allowConsole must be an array of RegExp values`);
  }
  if (definition.setup !== undefined && typeof definition.setup !== 'function') {
    throw new Error(`${filename}: setup(ctx) must be a function when present`);
  }
  if (definition.settle !== undefined && (!Number.isFinite(definition.settle) || definition.settle < 0)) {
    throw new Error(`${filename}: settle must be a non-negative number of milliseconds`);
  }
  return { ...definition, allowConsole, viewports };
}

async function loadDefinitions() {
  const entries = await readdir(DEFINITIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
  const definitions = [];
  for (const filename of files) {
    const file = path.join(DEFINITIONS_DIR, filename);
    const module = await import(pathToFileURL(file).href);
    definitions.push(validateDefinition(module.default, filename));
  }
  const duplicates = definitions.filter(
    (definition, index) => definitions.findIndex((candidate) => candidate.name === definition.name) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`duplicate probe name(s): ${[...new Set(duplicates.map((item) => item.name))].join(', ')}`);
  }
  return definitions;
}

function selectDefinitions(definitions, names) {
  if (names.length === 0) return definitions;
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) throw new Error(`unknown probe name(s): ${missing.join(', ')}`);
  return names.map((name) => byName.get(name));
}

async function collectCsp(page) {
  try {
    return await page.evaluate(() => window.__uxProbeCsp ?? []);
  } catch {
    return [];
  }
}

async function runViewport(browser, definition, viewport, baseUrl) {
  const result = {
    name: definition.name,
    route: definition.route,
    viewport,
    url: new URL(definition.route, baseUrl).href,
    checks: [],
    screenshots: [],
    cspViolations: [],
    styleSrcViolations: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    crash: null,
    passed: false,
  };
  let context;
  let page;
  let diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
  };

  const check = (label, condition) => {
    const passed = Boolean(condition);
    result.checks.push({ label, passed });
    console.log(`    ${passed ? '✓' : '✗'} ${label}`);
    return passed;
  };
  const shot = async (tag) => {
    const file = path.join(
      OUT_DIR,
      `${definition.name}--${viewport}--${slugify(tag) || 'shot'}.png`,
    );
    await page.screenshot({ path: file, fullPage: true });
    result.screenshots.push(rel(file));
    console.log(`    ✓ ${rel(file)}`);
    return rel(file);
  };

  try {
    context = await browser.newContext(contextOptions(viewport));
    page = await context.newPage();
    diagnostics = watchPage(page, definition.allowConsole);
    await installCspCollector(page);
    const ctx = { page, viewport, baseUrl, check, shot };
    if (definition.setup) await definition.setup(ctx);
    await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(definition.settle ?? DEFAULT_SETTLE_MS);
    await definition.run(ctx);
  } catch (error) {
    result.crash = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ crashed: ${result.crash}`);
  } finally {
    result.cspViolations = page ? await collectCsp(page) : [];
    result.styleSrcViolations = result.cspViolations.filter((entry) =>
      /style-src/i.test(entry.violatedDirective ?? entry.effectiveDirective ?? ''),
    );
    Object.assign(result, diagnostics);
    check('default gate: zero style-src CSP violations', result.styleSrcViolations.length === 0);
    check('default gate: zero unfiltered console errors', result.consoleErrors.length === 0);
    check('default gate: zero uncaught page errors', result.pageErrors.length === 0);
    result.passed = result.crash === null && result.checks.every((item) => item.passed);
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
  }
  return result;
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    console.error('✗ could not launch Chromium.');
    console.error(`  ${error.message}`);
    console.error('  Install it once with: npx playwright install chromium');
    process.exit(1);
  }
}

function printSummary(results) {
  const failed = results.filter((result) => !result.passed);
  const networkFindings = results.filter(
    (result) => result.failedRequests.length > 0 || result.httpErrors.length > 0,
  );
  console.log('');
  console.log(
    `${failed.length === 0 ? '✓' : '✗'} ${results.length - failed.length}/${results.length} probe viewport run(s) passed.`,
  );
  console.log(`Report: ${rel(REPORT_PATH)}`);
  console.log(`Shots:  ${rel(OUT_DIR)}/`);
  if (networkFindings.length > 0) {
    console.log(`Network findings recorded for ${networkFindings.length} run(s); inspect report.json.`);
  }
  for (const result of failed) {
    console.log(`  - ${result.name} [${result.viewport}]`);
  }
}

async function main() {
  const { names, opts } = parseArgs(process.argv.slice(2));
  const definitions = await loadDefinitions();
  if (opts.list) {
    for (const definition of definitions) console.log(definition.name);
    return;
  }
  const selected = selectDefinitions(definitions, names);
  console.log(`UX probes → ${opts.baseUrl}`);
  console.log(`  probes: ${selected.map((definition) => definition.name).join(', ')}`);
  if (!(await waitForServer(opts.baseUrl))) {
    throw new Error(`dev server at ${opts.baseUrl} did not respond; start pnpm dev first`);
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const definition of selected) {
      for (const viewport of definition.viewports) {
        console.log(`\n[${definition.name} / ${viewport}] ${definition.route}`);
        results.push(await runViewport(browser, definition, viewport, opts.baseUrl));
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(REPORT_PATH, `${JSON.stringify(results, null, 2)}\n`);
  printSummary(results);
  process.exit(results.every((result) => result.passed) ? 0 : 1);
}

main().catch((error) => {
  console.error(`✗ ux probe runner failed: ${error.message}`);
  process.exit(1);
});
