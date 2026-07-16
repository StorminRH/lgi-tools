import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 300));
});
page.on('response', (r) => {
  if (r.url().includes('/api/account/structures')) console.log('[net]', r.status(), r.url());
});
await page.goto('http://localhost:3000/industry/11394', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// What does the same-origin fetch return in-page?
const api = await page.evaluate(async () => {
  const r = await fetch('/api/account/structures');
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});
console.log('[in-page fetch]', JSON.stringify(api));

const txt = await page.evaluate(() => document.body.innerText);
for (const probe of ['BUILD AT', 'REACT AT', 'REFINERY', 'LOCATION', 'Add a build structure', 'Add a refinery']) {
  console.log(`${probe}: ${txt.toUpperCase().includes(probe.toUpperCase())}`);
}

const hero = page.locator('main div.rounded-md.border').first();
await hero.screenshot({ path: 'docs/ux-check/captures/hero-zoom.png' }).catch(async () => {
  await page.screenshot({ path: 'docs/ux-check/captures/hero-zoom.png', clip: { x: 0, y: 60, width: 1440, height: 320 } });
});
await browser.close();
console.log('done');
