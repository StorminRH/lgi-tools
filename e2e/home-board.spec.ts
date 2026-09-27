import { expect, test } from '@playwright/test';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import { resolveE2eStorageStatePath } from './identity';

test.use({ storageState: resolveE2eStorageStatePath() });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route('**/api/account/board', (route) =>
    route.fulfill({ json: buildDemoBoard(FIXTURE_NOW, 'full') }),
  );
});

test('the board renders below a hero that keeps its DOM while the session resolves', async ({ page }) => {
  type HeroProbe = Window & { heroAtParse?: Element | null };
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as HeroProbe).heroAtParse = document.querySelector('.home-hero');
    });
  });

  await page.goto('/');
  const tiles = page.getByRole('group', { name: 'Characters' }).getByRole('button');
  await expect(tiles).toHaveCount(5, { timeout: 15_000 });

  const kept = await page.evaluate(() => {
    const hero = (window as HeroProbe).heroAtParse;
    return hero != null && hero.isConnected && hero === document.querySelector('.home-hero');
  });
  expect(kept, 'the static-shell hero was replaced when the session resolved').toBe(true);

  await tiles.nth(1).click();
  await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article', { name: 'Kessa Draymoor character sheet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kessa Draymoor' })).toBeVisible();

  await tiles.nth(3).click();
  await expect(
    page.getByText('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.'),
  ).toBeVisible();
});

test('the board fits a phone without horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Characters' }).getByRole('button')).toHaveCount(5, {
    timeout: 15_000,
  });
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
