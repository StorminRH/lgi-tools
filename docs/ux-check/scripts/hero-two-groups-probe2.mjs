import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = [];
page.on('pageerror', (e) => console.log('[PAGEERROR]', String(e).slice(0, 500)));
page.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(r.url()); });
page.on('requestfailed', (r) => console.log('[REQFAILED]', r.url().slice(0, 140), r.failure()?.errorText));
await page.goto('http://localhost:3000/industry/11394', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('[api requests]', JSON.stringify(reqs, null, 0));
const txt = await page.evaluate(() => document.body.innerText);
for (const probe of ['REACT AT', 'LOCATION', 'Add a build structure', 'Add a refinery']) {
  console.log(`${probe}: ${txt.toUpperCase().includes(probe.toUpperCase())}`);
}
await browser.close();
console.log('done');
