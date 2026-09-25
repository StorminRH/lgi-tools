// Run: node docs/mockups/homepage-redesign/shoot.mjs [name...]
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));

const SHOTS = [
  { name: 'tokens-v2', file: 'tokens.html', vp: [1440, 900], full: true },
  { name: 'a-orbit', file: 'a-orbit.html', vp: [1440, 900], full: true },
  { name: 'a-orbit-mobile', file: 'a-orbit.html', vp: [390, 844], full: true },
  { name: 'b-chain', file: 'b-chain.html', vp: [1440, 900] },
  { name: 'b-chain-menu-open', file: 'b-chain.html', vp: [1440, 900], hash: '#menu' },
  { name: 'b-chain-mobile', file: 'b-chain.html', vp: [390, 844] },
  { name: 'c-deck', file: 'c-deck.html', vp: [1440, 900], full: true },
  { name: 'c-deck-mobile', file: 'c-deck.html', vp: [390, 844], full: true },
];

const only = process.argv.slice(2);
const browser = await chromium.launch();
for (const s of SHOTS) {
  if (only.length && !only.some((o) => s.name.startsWith(o))) continue;
  const page = await browser.newPage({ viewport: { width: s.vp[0], height: s.vp[1] }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(dir, s.file)).href + (s.hash ?? ''));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3200); // let entrance + draw animations settle
  if (s.full) {
    // Grow the viewport to the document instead of fullPage, so fixed chrome
    // (bottom nav, backdrops) lands where it would on a real long screen.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: s.vp[0], height: h });
    await page.waitForTimeout(1800); // count-ups that just scrolled into view
  }
  await page.screenshot({ path: path.join(dir, 'screenshots', `${s.name}.jpg`), type: 'jpeg', quality: 88 });
  console.log('shot', s.name);
  await page.close();
}
await browser.close();
