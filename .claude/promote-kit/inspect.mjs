#!/usr/bin/env node
// inspect.mjs <origin> <path> [selector] [--auth signed-out|pilot|admin] [--shot file.png]
//
// Finds a region selector for a shot list: loads the page like capture.mjs does, then prints
// every element matching <selector> (default: charts and admin cards) with its size and its
// ancestor chain (tag, first classes, data-*/aria-label attributes). --shot saves a full-page PNG.
import path from 'node:path';
import { createRequire } from 'node:module';
import { KIT, ensurePilot, statePath } from './pilot.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const auth = opt('--auth', 'signed-out');
const shotFile = opt('--shot');
const [origin, pagePath, selector = 'svg[aria-label], [data-admin-card]'] = args;
if (!origin || !pagePath) {
  console.error('usage: node inspect.mjs <origin> <path> [selector] [--auth signed-out|pilot|admin] [--shot file.png]');
  process.exit(2);
}
const req = createRequire(path.join(KIT, 'wt-new', 'package.json'));
const { chromium } = req('playwright');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const ctxOpts = { viewport: { width: 1440, height: 900 } };
if (auth !== 'signed-out') {
  await ensurePilot(origin, { quiet: true });
  ctxOpts.storageState = statePath(origin);
}
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
await page.route('**://images.evetech.net/**', (route) => route.abort());
await page.goto(new URL(pagePath, origin).href, { timeout: 180_000 });
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1000);
const found = await page.locator(selector).evaluateAll((els) =>
  els.map((el) => {
    const describe = (e) => {
      const r = e.getBoundingClientRect();
      const cls = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
      const attrs = [...e.attributes]
        .filter((a) => a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'id')
        .map((a) => `${a.name}="${a.value.slice(0, 60)}"`)
        .join(' ');
      return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''} ${attrs} [${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.y + scrollY)}]`;
    };
    const chain = [];
    for (let e = el.parentElement; e && e !== document.body && chain.length < 8; e = e.parentElement) chain.push(describe(e));
    const texts = el.tagName.toLowerCase() === 'svg' ? [...el.querySelectorAll('text')].map((t) => t.textContent).slice(0, 20) : [];
    return { element: describe(el), texts, chain };
  }),
);
console.log(JSON.stringify(found, null, 2));
if (shotFile) await page.screenshot({ path: shotFile, fullPage: true });
await browser.close();
