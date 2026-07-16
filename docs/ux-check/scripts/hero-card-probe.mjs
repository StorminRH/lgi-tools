// Focused capture of the restructured planner hero card (3.7.10.1). Crops to the
// HeroCard element (not the tall full page) at desktop + mobile, logged-out, and
// best-effort captures the build-system-selected state so Group A's Structure
// selector appears (closer to the mockup's populated look). Run against the dev
// server on :3000 — browse it as localhost (a 127.0.0.1 URL silently skips hydration).
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL ?? 'http://localhost:3000/industry/11394'; // Retribution BP
const OUT = 'docs/ux-check/captures';
const browser = await chromium.launch();

// The HeroCard is the direct parent of the Run-As frame (aria-label "Building
// character" when logged-out). Walk up one level to the card container.
const heroCard = (page) => page.locator('div[aria-label="Building character"]').locator('xpath=..');

async function shoot(viewport, name, { selectSystem = false } = {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  if (selectSystem) {
    try {
      const input = page.getByPlaceholder(/type a name/i).first();
      await input.click();
      await input.fill('Jita');
      await page.waitForTimeout(1200);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log(`  (system-select skipped: ${e.message})`);
    }
  }

  const card = heroCard(page);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${OUT}/${name}.png`);
  await ctx.close();
}

console.log('Hero card capture →', URL);
await shoot({ width: 1440, height: 900 }, 'hero-desktop');
await shoot({ width: 1440, height: 900 }, 'hero-desktop-system', { selectSystem: true });
await shoot({ width: 390, height: 844 }, 'hero-mobile');
await browser.close();
console.log('done');
