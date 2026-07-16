// Records successful image requests for the EveImage migration. Run with the
// local dev server on http://localhost:3000:
//   node docs/ux-check/scripts/eve-image-network-probe.mjs
// Output: docs/ux-check/captures/eve-image-network-report.json

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ROUTES = ['/', '/contact', '/industry/11372'];
const OUT = path.resolve('docs/ux-check/captures/eve-image-network-report.json');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const rows = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  const requests = [];
  const consoleErrors = [];

  page.on('request', (request) => {
    const url = request.url();
    if (
      request.resourceType() === 'image' ||
      url.includes('/_next/image') ||
      url.includes('images.evetech.net')
    ) {
      requests.push(url);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(new URL(route, BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  rows.push({ route, requests: [...new Set(requests)], consoleErrors });
  await page.close();
}

await browser.close();

const allRequests = rows.flatMap((row) => row.requests);
const allConsoleErrors = rows.flatMap((row) => row.consoleErrors);
const report = {
  routes: rows,
  summary: {
    eveRequests: allRequests.filter((url) => url.startsWith('https://images.evetech.net/')),
    staticRequests: allRequests.filter((url) => url.includes('/eve-sso-login-black-large.png')),
    optimizerRequests: allRequests.filter((url) => url.includes('/_next/image')),
    loaderWarnings: allConsoleErrors.filter((message) =>
      message.includes('next-image-missing-loader-width'),
    ),
    hydrationErrors: allConsoleErrors.filter((message) => /hydration|hydrated/i.test(message)),
  },
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${path.relative(process.cwd(), OUT)}`);

if (
  report.summary.optimizerRequests.length > 0 ||
  report.summary.loaderWarnings.length > 0 ||
  report.summary.hydrationErrors.length > 0
) {
  process.exitCode = 1;
}
