import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { installOriginScopedBypass, loadRemoteAuthOptions } from './ux-remote-auth.mjs';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const baseUrlArg = args[0];
if (!baseUrlArg) {
  throw new Error(
    'Usage: pnpm verify:site-routes -- https://deployment.example.vercel.app [--cookie-jar path] [--storage-state path]',
  );
}

function readFlag(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a path argument`);
  }
  return value;
}

const cookieJarPath = readFlag('--cookie-jar');
const storageStatePath = readFlag('--storage-state');

const baseUrl = new URL(baseUrlArg);
baseUrl.pathname = '/';
baseUrl.search = '';
baseUrl.hash = '';

const OUT_DIR = path.resolve(process.cwd(), 'docs/ux-check/captures');
const rel = (file) => path.relative(process.cwd(), file);

const CASES = [
  { path: '/sites/100', expectedStatus: 404, invalid: true },
  { path: '/sites/3', expectedStatus: 200, invalid: false },
];

function isExpectedDocument404(entry, targetUrl, invalid) {
  if (!invalid || !entry.text.includes('404')) return false;
  return entry.location === '' || entry.location === targetUrl;
}

const auth = await loadRemoteAuthOptions({
  storageState: storageStatePath,
  cookieJar: cookieJarPath,
});

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...(auth.storageState ? { storageState: auth.storageState } : {}),
});
await installOriginScopedBypass(context, baseUrl.origin);
if (auth.cookies.length > 0) await context.addCookies(auth.cookies);
const reports = [];

try {
  for (const route of CASES) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failureArtifacts = [];
    const targetUrl = new URL(route.path, baseUrl).toString();

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      consoleErrors.push({
        text: message.text(),
        location: message.location().url,
      });
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(1_500);

    const status = response?.status() ?? null;
    const title = await page.title();
    const robots = await page.locator('meta[name="robots"]').evaluateAll(
      (elements) => elements.map((element) => element.getAttribute('content') ?? ''),
    );
    const robotsHeader = (response?.headers()?.['x-robots-tag'] ?? '').toLowerCase();
    const robotsValue = robots.join(', ').toLowerCase();
    const hasNoindex =
      robotsValue.includes('noindex') || robotsHeader.includes('noindex');
    const unexpectedConsoleErrors = consoleErrors.filter(
      (entry) => !isExpectedDocument404(entry, targetUrl, route.invalid),
    );
    const checks = {
      status: status === route.expectedStatus,
      title: route.invalid
        ? title === 'Not found | LGI.tools'
        : title.length > 0 && title !== 'Not found | LGI.tools',
      robots: route.invalid ? hasNoindex : !hasNoindex,
      pageErrors: pageErrors.length === 0,
      consoleErrors: unexpectedConsoleErrors.length === 0,
    };
    const passed = Object.values(checks).every(Boolean);
    if (!passed) {
      const file = path.join(
        OUT_DIR,
        `verify-site-routes--${route.path.replace(/\W+/g, '-') || 'root'}--failure.png`,
      );
      try {
        await page.screenshot({ path: file, fullPage: true });
        failureArtifacts.push(rel(file));
      } catch {

      }
    }

    reports.push({
      route: route.path,
      status,
      title,
      robots,
      pageErrors,
      consoleErrors,
      unexpectedConsoleErrors,
      checks,
      failureArtifacts,
      passed,
    });
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
}

const passed = reports.every((report) => report.passed);
console.log(JSON.stringify({ baseUrl: baseUrl.origin, passed, reports }, null, 2));
if (!passed) process.exitCode = 1;
