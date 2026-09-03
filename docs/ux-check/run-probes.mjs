import { instant as nextInstant } from '@next/playwright';
import { chromium, firefox, webkit, devices } from 'playwright';
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPORTS } from '../../scripts/ux-capture-args.mjs';
import {
  installOriginScopedBypass,
  loadRemoteAuthOptions,
} from '../../scripts/ux-remote-auth.mjs';

const ROOT = process.cwd();
const DEFINITIONS_DIR = path.resolve(ROOT, 'docs/ux-check/probes');
const OUT_DIR = path.resolve(ROOT, 'docs/ux-check/captures/probes');
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
const DEFAULT_SETTLE_MS = 1000;
const DEFAULT_VIEWPORTS = ['desktop', 'mobile'];
const ENGINES = {
  chromium,
  firefox,
  webkit,
};
const STANDARD_CONSOLE_NOISE = [
  /ws:\/\/127\.0\.0\.1:3210/i,
  /127\.0\.0\.1:3210.*ERR_CONNECTION_REFUSED/i,
  /ERR_CONNECTION_REFUSED.*127\.0\.0\.1:3210/i,
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
    engine: 'chromium',
    storageState: process.env.UX_STORAGE_STATE ?? null,
    cookieJar: process.env.UX_COOKIE_JAR ?? null,
    captureStorageState: null,
  };
  for (const arg of argv) {
    if (arg === '--list') opts.list = true;
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--engine=')) opts.engine = arg.slice('--engine='.length);
    else if (arg.startsWith('--storage-state=')) {
      opts.storageState = arg.slice('--storage-state='.length);
    } else if (arg.startsWith('--cookie-jar=')) {
      opts.cookieJar = arg.slice('--cookie-jar='.length);
    } else if (arg.startsWith('--capture-storage-state=')) {
      opts.captureStorageState = arg.slice('--capture-storage-state='.length);
    } else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else names.push(arg);
  }
  if (!(opts.engine in ENGINES)) {
    throw new Error(`unknown engine: ${opts.engine} (use ${Object.keys(ENGINES).join(', ')})`);
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

function contextOptions(viewport, reducedMotion) {
  const motion = reducedMotion ? 'reduce' : 'no-preference';
  if (viewport === 'mobile') {
    return {
      ...devices['Pixel 7'],
      viewport: VIEWPORTS.mobile,
      screen: VIEWPORTS.mobile,
      hasTouch: true,
      isMobile: true,
      reducedMotion: motion,
    };
  }
  return {
    viewport: VIEWPORTS[viewport],
    hasTouch: false,
    isMobile: false,
    reducedMotion: motion,
  };
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
    throw new Error(
      `${filename}: viewports must contain one or more of: ${Object.keys(VIEWPORTS).join(', ')}`,
    );
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
  if (definition.reducedMotion !== undefined && typeof definition.reducedMotion !== 'boolean') {
    throw new Error(`${filename}: reducedMotion must be a boolean when present`);
  }
  if (definition.requiresAuth !== undefined && typeof definition.requiresAuth !== 'boolean') {
    throw new Error(`${filename}: requiresAuth must be a boolean when present`);
  }
  return {
    ...definition,
    allowConsole,
    viewports,
    reducedMotion: definition.reducedMotion ?? false,
    requiresAuth: definition.requiresAuth ?? false,
  };
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

async function runViewport(browser, definition, viewport, baseUrl, opts, auth) {
  const result = {
    name: definition.name,
    route: definition.route,
    viewport,
    engine: opts.engine,
    url: new URL(definition.route, baseUrl).href,
    checks: [],
    screenshots: [],
    failureArtifacts: [],
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
  const ownedContexts = [];

  const check = (label, condition) => {
    const passed = Boolean(condition);
    result.checks.push({ label, passed });
    console.log(`    ${passed ? '✓' : '✗'} ${label}`);
    return passed;
  };
  const shot = async () => null;

  const createContext = async ({
    storageState = opts.storageState,
    engineName = opts.engine,
    viewportName = viewport,
  } = {}) => {
    const launcher = ENGINES[engineName];
    if (launcher === undefined) {
      throw new Error(`unknown engine for createContext: ${engineName}`);
    }
    const secondaryBrowser =
      engineName === opts.engine ? browser : await launcher.launch();
    const secondaryContext = await secondaryBrowser.newContext({
      ...contextOptions(viewportName, definition.reducedMotion),
      ...(definition.requiresAuth && storageState ? { storageState } : {}),
    });
    await installOriginScopedBypass(secondaryContext, opts.baseUrl);
    if (definition.requiresAuth && auth.cookies.length > 0) {
      await secondaryContext.addCookies(auth.cookies);
    }
    ownedContexts.push({
      context: secondaryContext,
      browser: engineName === opts.engine ? null : secondaryBrowser,
      page: null,
      diagnostics: null,
    });
    const secondaryPage = await secondaryContext.newPage();
    const secondaryDiagnostics = watchPage(secondaryPage, definition.allowConsole);
    await installCspCollector(secondaryPage);
    const owned = ownedContexts.at(-1);
    owned.page = secondaryPage;
    owned.diagnostics = secondaryDiagnostics;
    return { browser: secondaryBrowser, context: secondaryContext, page: secondaryPage };
  };

  try {
    if (definition.requiresAuth && !opts.storageState && auth.cookies.length === 0) {
      throw new Error(
        `${definition.name} requires auth: run pnpm e2e:seed and pass --storage-state=docs/ux-check/captures/auth-storage.json (or UX_STORAGE_STATE / UX_COOKIE_JAR / --cookie-jar)`,
      );
    }
    context = await browser.newContext({
      ...contextOptions(viewport, definition.reducedMotion),
      ...(definition.requiresAuth && opts.storageState
        ? { storageState: opts.storageState }
        : {}),
    });
    await installOriginScopedBypass(context, opts.baseUrl);
    if (definition.requiresAuth && auth.cookies.length > 0) {
      await context.addCookies(auth.cookies);
    }
    page = await context.newPage();
    diagnostics = watchPage(page, definition.allowConsole);
    await installCspCollector(page);
    const instant = (fn, options) =>
      nextInstant(page, fn, { baseURL: baseUrl, ...options });
    const ctx = {
      page,
      viewport,
      baseUrl,
      check,
      shot,
      instant,
      engine: opts.engine,
      storageState: opts.storageState,
      createContext,
    };
    if (definition.setup) await definition.setup(ctx);
    await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(definition.settle ?? DEFAULT_SETTLE_MS);
    await definition.run(ctx);
  } catch (error) {
    result.crash = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ crashed: ${result.crash}`);
  } finally {
    const watchedPages = [
      ...(page ? [{ page, diagnostics }] : []),
      ...ownedContexts.filter(
        (owned) => owned.page !== null && owned.diagnostics !== null,
      ),
    ];
    result.cspViolations = (
      await Promise.all(watchedPages.map((owned) => collectCsp(owned.page)))
    ).flat();
    result.styleSrcViolations = result.cspViolations.filter((entry) =>
      /style-src/i.test(entry.violatedDirective ?? entry.effectiveDirective ?? ''),
    );
    for (const field of [
      'consoleErrors',
      'pageErrors',
      'failedRequests',
      'httpErrors',
    ]) {
      result[field] = watchedPages.flatMap((owned) => owned.diagnostics[field]);
    }
    check('default gate: zero style-src CSP violations', result.styleSrcViolations.length === 0);
    check('default gate: zero unfiltered console errors', result.consoleErrors.length === 0);
    check('default gate: zero uncaught page errors', result.pageErrors.length === 0);
    result.passed = result.crash === null && result.checks.every((item) => item.passed);
    if (!result.passed) {
      for (const [index, watched] of watchedPages.entries()) {
        try {
          const clientSuffix = index === 0 ? '' : `--client-${index + 1}`;
          const file = path.join(
            OUT_DIR,
            `${definition.name}--${opts.engine}--${viewport}${clientSuffix}--failure.png`,
          );
          await watched.page.screenshot({ path: file, fullPage: true });
          const relative = rel(file);
          result.failureArtifacts.push(relative);
          result.screenshots.push(relative);
          console.log(`    failure artifact: ${relative}`);
        } catch {
        }
      }
    }
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    for (const owned of ownedContexts) {
      await owned.context.close().catch(() => {});
      await owned.browser?.close().catch(() => {});
    }
  }
  return result;
}

async function launchBrowser(engineName) {
  try {
    return await ENGINES[engineName].launch();
  } catch (error) {
    console.error(`✗ could not launch ${engineName}.`);
    console.error(`  ${error.message}`);
    console.error(`  Install it once with: npx playwright install ${engineName}`);
    process.exit(1);
  }
}

function printSummary(results) {
  const failed = results.filter((result) => !result.passed);
  const networkFindings = results.filter(
    (result) => result.failedRequests.length > 0 || result.httpErrors.length > 0,
  );
  const artifacts = results.reduce((n, result) => n + (result.failureArtifacts?.length ?? 0), 0);
  console.log('');
  console.log(
    `${failed.length === 0 ? '✓' : '✗'} ${results.length - failed.length}/${results.length} probe viewport run(s) passed.`,
  );
  console.log(`Report: ${rel(REPORT_PATH)}`);
  console.log(`Failure artifacts: ${artifacts} under ${rel(OUT_DIR)}/`);
  if (networkFindings.length > 0) {
    console.log(`Network findings recorded for ${networkFindings.length} run(s); inspect report.json.`);
  }
  for (const result of failed) {
    console.log(`  - ${result.name} [${result.viewport}]`);
  }
  console.log(
    'Operator visual checklist: open each probed interaction in your browser and confirm layout/feel.',
  );
}

async function captureStorageState(opts) {
  if (!(await waitForServer(opts.baseUrl))) {
    throw new Error(`dev server at ${opts.baseUrl} did not respond; start pnpm dev first`);
  }
  const sessionUrl = new URL('/api/auth/get-session', opts.baseUrl).href;
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(opts.baseUrl);
    console.log('Log in through EVE SSO in the opened browser…');
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const session = await context.request
        .get(sessionUrl)
        .then(async (response) => {
          if (!response.ok()) return null;
          const body = await response.json();
          return body?.user ? body : null;
        })
        .catch(() => null);
      if (session !== null) {
        console.log(`Signed in as ${session.user?.name ?? 'unknown'} — saving state.`);
        break;
      }
      if (Date.now() > deadline) {
        throw new Error('no authenticated session within 10 minutes; capture aborted');
      }
      await wait(2000);
    }
    await context.storageState({ path: opts.captureStorageState });
    console.log(`✓ storage state saved: ${rel(path.resolve(opts.captureStorageState))}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const { names, opts } = parseArgs(process.argv.slice(2));
  if (opts.captureStorageState) {
    await captureStorageState(opts);
    return;
  }
  const definitions = await loadDefinitions();
  if (opts.list) {
    for (const definition of definitions) console.log(definition.name);
    return;
  }
  const auth = await loadRemoteAuthOptions({
    storageState: opts.storageState,
    cookieJar: opts.cookieJar,
  });
  if (opts.storageState) {
    await access(opts.storageState).catch(() => {
      throw new Error(`storage state not found: ${opts.storageState}`);
    });
  }
  const selected = selectDefinitions(definitions, names);
  console.log(`UX probes → ${opts.baseUrl}`);
  console.log(`  engine: ${opts.engine}`);
  console.log(
    `  storage: ${opts.storageState ? rel(path.resolve(opts.storageState)) : opts.cookieJar ? `cookie-jar ${opts.cookieJar}` : '(anonymous)'}`,
  );
  console.log(`  probes: ${selected.map((definition) => definition.name).join(', ')}`);
  if (!(await waitForServer(opts.baseUrl))) {
    throw new Error(`dev server at ${opts.baseUrl} did not respond; start pnpm dev first`);
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launchBrowser(opts.engine);
  const results = [];
  try {
    for (const definition of selected) {
      for (const viewport of definition.viewports) {
        console.log(
          `\n[${definition.name} / ${opts.engine} / ${viewport}] ${definition.route}`,
        );
        results.push(
          await runViewport(browser, definition, viewport, opts.baseUrl, opts, auth),
        );
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
