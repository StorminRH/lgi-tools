// Production-runtime regression probe for the carried invalid-site React #419
// rider. Run against a Vercel preview, never a local production build:
//   pnpm verify:site-routes -- https://deployment.example.vercel.app
//
// Prints one JSON report and exits non-zero unless /sites/100 is the expected
// noindex 404, /sites/3 remains a normal indexable 200, and neither page emits
// an uncaught page error or unexpected console error.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const baseUrlArg = args[0];
if (!baseUrlArg) {
  throw new Error(
    'Usage: pnpm verify:site-routes -- https://deployment.example.vercel.app [--cookie-jar path]',
  );
}

const cookieJarFlag = args.indexOf('--cookie-jar');
const cookieJarPath = cookieJarFlag === -1 ? null : args[cookieJarFlag + 1];
if (cookieJarFlag !== -1 && !cookieJarPath) {
  throw new Error('--cookie-jar requires a Netscape-format cookie file path');
}

const baseUrl = new URL(baseUrlArg);
baseUrl.pathname = '/';
baseUrl.search = '';
baseUrl.hash = '';

const CASES = [
  { path: '/sites/100', expectedStatus: 404, invalid: true },
  { path: '/sites/3', expectedStatus: 200, invalid: false },
];

function isExpectedDocument404(entry, targetUrl, invalid) {
  if (!invalid || !entry.text.includes('404')) return false;
  return entry.location === '' || entry.location === targetUrl;
}

function requireCookieField(value, label) {
  if (value === undefined || value === '') throw new Error(`Cookie ${label} is missing`);
  return value;
}

function parseCookieExpiry(expires) {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return -1;
  return expiresAt;
}

function parseCookieLine(line) {
  const httpOnly = line.startsWith('#HttpOnly_');
  const normalizedLine = httpOnly ? line.slice('#HttpOnly_'.length) : line;
  const [domain, , path, secure, expires, name, value] = normalizedLine.split('\t');
  return {
    name: requireCookieField(name, 'name'),
    value: requireCookieField(value, 'value'),
    domain: requireCookieField(domain, 'domain'),
    path: requireCookieField(path, 'path'),
    secure: secure === 'TRUE',
    httpOnly,
    expires: parseCookieExpiry(expires),
  };
}

async function readNetscapeCookies(filePath) {
  if (!filePath) return [];
  const contents = await readFile(filePath, 'utf8');
  return contents
    .split('\n')
    .filter((line) => line.trim() !== '' && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
    .map(parseCookieLine);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(await readNetscapeCookies(cookieJarPath));
const reports = [];

try {
  for (const route of CASES) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
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
    const robotsValue = robots.join(', ').toLowerCase();
    const unexpectedConsoleErrors = consoleErrors.filter(
      (entry) => !isExpectedDocument404(entry, targetUrl, route.invalid),
    );
    const checks = {
      status: status === route.expectedStatus,
      title: route.invalid
        ? title === 'Not found | LGI.tools'
        : title.length > 0 && title !== 'Not found | LGI.tools',
      robots: route.invalid
        ? robotsValue.includes('noindex')
        : !robotsValue.includes('noindex'),
      pageErrors: pageErrors.length === 0,
      consoleErrors: unexpectedConsoleErrors.length === 0,
    };

    reports.push({
      route: route.path,
      status,
      title,
      robots,
      pageErrors,
      consoleErrors,
      unexpectedConsoleErrors,
      checks,
      passed: Object.values(checks).every(Boolean),
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
