import { expect, type Page, test } from '@playwright/test';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import { resolveE2eStorageStatePath } from './identity';

test.use({ storageState: resolveE2eStorageStatePath() });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route('**/api/account/board', (route) =>
    route.fulfill({ json: buildDemoBoard(FIXTURE_NOW, 'full') }),
  );
});

const pilots = (page: Page) => page.getByRole('group', { name: 'Characters' }).getByRole('button');
const sheet = (page: Page, name: string) => page.getByRole('article', { name: `${name} character sheet` });

test('the board takes the folded hero’s place, and the hero keeps its DOM node', async ({ page }) => {
  type HeroProbe = Window & { heroAtParse?: Element | null };
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as HeroProbe).heroAtParse = document.querySelector('.home-hero');
    });
  });

  await page.goto('/');
  await expect(pilots(page)).toHaveCount(5, { timeout: 15_000 });

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

test('a pilot opens its sheet and Back returns to the roster without a document load', async ({ page }) => {
  const documents: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url());
  });
  await page.goto('/');
  await expect(pilots(page)).toHaveCount(5, { timeout: 15_000 });
  await page.evaluate(() => {
    (window as Window & { boardProbe?: boolean }).boardProbe = true;
  });
  const loads = documents.length;

  await pilots(page).nth(1).click();
  await expect(sheet(page, 'Kessa Draymoor')).toBeVisible();
  await expect(page).toHaveURL(/[?&]character=9900000002/);
  await expect(pilots(page)).toHaveCount(0);

  await page.getByRole('button', { name: /All characters/ }).click();
  await expect(pilots(page)).toHaveCount(5);
  await expect(page).not.toHaveURL(/character=/);

  await pilots(page).nth(2).click();
  await expect(sheet(page, 'Torvin Hale')).toBeVisible();
  await page.goBack();
  await expect(pilots(page)).toHaveCount(5);

  await page.goForward();
  await expect(sheet(page, 'Torvin Hale')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pilots(page)).toHaveCount(5);

  expect(documents.length, documents.join('\n')).toBe(loads);
  expect(await page.evaluate(() => (window as Window & { boardProbe?: boolean }).boardProbe)).toBe(true);
});

test('Ilyana’s sheet carries the one reconnect sentence', async ({ page }) => {
  await page.goto('/');
  await pilots(page).nth(3).click();
  await expect(
    page.getByText('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.'),
  ).toBeVisible();
});

test('a reload opens the named character and an unknown one falls back to the roster', async ({ page }) => {
  await page.goto('/?character=9900000003');
  await expect(sheet(page, 'Torvin Hale')).toBeVisible({ timeout: 15_000 });
  await page.goto('/?character=42');
  await expect(pilots(page)).toHaveCount(5, { timeout: 15_000 });
});

test('the board fits a phone without horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(pilots(page)).toHaveCount(5, { timeout: 15_000 });
  const fits = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await pilots(page).first().click();
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible();
  expect(await fits()).toBe(true);
});
