import { expect, type Page, test } from '@playwright/test';
import { buildDemoBoard, type DemoVariant, FIXTURE_NOW } from '@/composition/board/demo-board';
import { resolveE2eStorageStatePath } from './identity';

test.use({ storageState: resolveE2eStorageStatePath() });

async function serveBoard(page: Page, variant: DemoVariant = 'full') {
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route('**/api/account/board', (route) =>
    route.fulfill({ json: buildDemoBoard(FIXTURE_NOW, variant) }),
  );
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Pilots' });
const pilot = (page: Page, id: number) => rail(page).locator(`[data-pilot-id="${id}"]`);
const overview = (page: Page) => page.getByRole('region', { name: 'Pilot overview' });
const sheet = (page: Page, name: string) => page.getByRole('article', { name: `${name} character sheet` });

test('the board takes the folded hero’s place, and the hero keeps its DOM node', async ({ page }) => {
  await serveBoard(page);
  type HeroProbe = Window & { heroAtParse?: Element | null };
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as HeroProbe).heroAtParse = document.querySelector('.home-hero');
    });
  });

  await page.goto('/');
  await expect(overview(page)).toBeVisible({ timeout: 15_000 });

  const kept = await page.evaluate(() => {
    const hero = (window as HeroProbe).heroAtParse;
    return hero != null && hero.isConnected && hero === document.querySelector('.home-hero');
  });
  expect(kept, 'the static-shell hero was replaced when the session resolved').toBe(true);
  await expect(page.locator('.signed-in-fold')).toHaveAttribute('data-folded', 'true');
  await expect
    .poll(() => page.locator('.signed-in-fold').evaluate((fold) => fold.getBoundingClientRect().height))
    .toBe(0);
});

test('several pilots open on the overview: the rail and the aggregate cards', async ({ page }) => {
  await serveBoard(page);
  await page.goto('/');
  await expect(rail(page).locator('[data-pilot-id]')).toHaveCount(5, { timeout: 15_000 });
  for (const title of ['Needs attention', 'Training', 'Wealth']) {
    await expect(overview(page).locator('section').getByText(title, { exact: true }).first()).toBeVisible();
  }
});

test('a pilot opens its sheet; Back and Escape return to the overview without a document load', async ({ page }) => {
  await serveBoard(page);
  const documents: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url());
  });
  await page.goto('/');
  await expect(overview(page)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as Window & { boardProbe?: boolean }).boardProbe = true;
  });
  const loads = documents.length;

  await pilot(page, 9_900_000_002).click();
  await expect(sheet(page, 'Kessa Draymoor')).toBeVisible();
  await expect(page).toHaveURL(/[?&]character=9900000002/);
  await expect(pilot(page, 9_900_000_002)).toHaveAttribute('aria-pressed', 'true');

  await page.goBack();
  await expect(overview(page)).toBeVisible();
  await expect(page).not.toHaveURL(/character=/);

  await pilot(page, 9_900_000_003).click();
  await expect(sheet(page, 'Torvin Hale')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overview(page)).toBeVisible();

  await pilot(page, 9_900_000_004).click();
  await expect(
    page.getByText('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'All pilots' }).click();
  await expect(overview(page)).toBeVisible();

  expect(documents.length, documents.join('\n')).toBe(loads);
  expect(await page.evaluate(() => (window as Window & { boardProbe?: boolean }).boardProbe)).toBe(true);
});

test('a single-pilot account lands on that pilot’s sheet with no rail', async ({ page }) => {
  await serveBoard(page, 'one');
  await page.goto('/');
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible({ timeout: 15_000 });
  await expect(rail(page)).toHaveCount(0);
});

test('the board fits a phone without horizontal page scroll', async ({ page }) => {
  await serveBoard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(overview(page)).toBeVisible({ timeout: 15_000 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await pilot(page, 9_900_000_001).click();
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible();
  expect(await fits()).toBe(true);
});
