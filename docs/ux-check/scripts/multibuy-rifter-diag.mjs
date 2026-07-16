// One-off diagnostic (3.7.22.1 review): on the Jaguar planner, uncheck ALL
// multibuy tiers and print the full copied clipboard — checking whether the
// Rifter (the T1 hull input) is listed when every tier is bought.
//   node docs/ux-check/scripts/multibuy-rifter-diag.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/industry/11401';
const browser = await chromium.launch();
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

await page.getByRole('button', { name: 'Multibuy export' }).first().click();
await page.waitForTimeout(300);

const boxes = page.getByRole('checkbox', { name: /Build tier \d+/ });
const n = await boxes.count();
console.log(`tier checkboxes: ${n}`);
for (let i = 0; i < n; i++) {
  if ((await boxes.nth(i).getAttribute('aria-checked')) === 'true') await boxes.nth(i).click();
  await page.waitForTimeout(100);
}
const summary = await page.getByText(/\d+ items? · /).first().textContent();
console.log(`summary after unchecking all: ${summary?.trim()}`);

await page.getByRole('button', { name: 'Copy', exact: true }).click();
await page.waitForTimeout(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log('--- clipboard ---');
console.log(clip);
console.log('--- end ---');
console.log(clip.includes('Rifter') ? 'RIFTER PRESENT' : 'RIFTER MISSING');
await browser.close();
