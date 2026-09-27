import { expect, type Page, test } from '@playwright/test';
import { buildDemoBoard, type DemoVariant, FIXTURE_NOW } from '@/composition/board/demo-board';
import { resolveE2eStorageStatePath } from './identity';

test.use({ storageState: resolveE2eStorageStatePath() });

async function serveBoard(page: Page, variant: DemoVariant = 'full', board = buildDemoBoard(FIXTURE_NOW, variant)) {
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route('**/api/account/board', (route) => route.fulfill({ json: board }));
}

// Aurel with a 42-entry queue whose first three entries have already finished.
function longQueueBoard() {
  const board = buildDemoBoard(FIXTURE_NOW, 'full');
  const [aurel] = board.characters;
  if (aurel?.skills.state !== 'ready') throw new Error('demo pilot has no skills');
  const skillIds = board.skillCatalog.flatMap((group) => group.skills.map((skill) => skill.typeId));
  const HOUR = 3_600_000;
  aurel.skills.data.queue = Array.from({ length: 42 }, (_, i) => {
    const start = FIXTURE_NOW + (i - 3.5) * 6 * HOUR;
    return {
      skill_id: skillIds[i % skillIds.length] ?? 3300,
      queue_position: i,
      finished_level: (i % 5) + 1,
      start_date: new Date(start).toISOString(),
      finish_date: new Date(start + 6 * HOUR).toISOString(),
    };
  });
  return board;
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

test('several pilots open on the wealth overview, with each pilot’s state on the rail', async ({ page }) => {
  await serveBoard(page);
  await page.goto('/');
  await expect(rail(page).locator('[data-pilot-id]')).toHaveCount(5, { timeout: 15_000 });
  await expect(overview(page).locator('section').first()).toContainText('Wealth');
  await expect(overview(page).getByText('7.75B', { exact: false }).first()).toBeVisible();
  await expect(overview(page).getByText('3 of 5 pilots')).toBeVisible();
  await expect(overview(page).getByRole('img', { name: 'Estimated net worth over time' })).toBeVisible();
  await expect(overview(page).locator('[data-band]')).toHaveCount(2);
  await overview(page).getByRole('button', { name: 'About estimated net worth' }).click();
  await expect(page.getByRole('dialog', { name: 'About estimated net worth' })).toContainText('Estimated net worth');
  await expect(page.getByText('Not counted: blueprints, SKINs, and PLEX in your PLEX vault.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overview(page).locator('section').getByText('Industry', { exact: true })).toBeVisible();
  for (const gone of ['Training', 'Whereabouts', 'Skill points']) {
    await expect(overview(page).getByText(gone, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Your characters', { exact: true })).toHaveCount(0);
  await expect(rail(page).getByRole('button').last()).toHaveAccessibleName('Add character');
  await expect(pilot(page, 9_900_000_002)).toContainText('Medium Drone Operation');
  await expect(pilot(page, 9_900_000_002)).toContainText('Tama');
});

test('a pilot opens full width without the rail; Back, the back control and Escape return without a document load', async ({ page }) => {
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
  await expect(rail(page)).toHaveCount(0);

  await page.goBack();
  await expect(overview(page)).toBeVisible();
  await expect(page).not.toHaveURL(/character=/);

  await pilot(page, 9_900_000_003).click();
  await expect(sheet(page, 'Torvin Hale')).toBeVisible();
  await page.getByRole('button', { name: /All characters/ }).click();
  await expect(overview(page)).toBeVisible();

  await pilot(page, 9_900_000_004).click();
  await expect(
    page.getByText('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.').first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overview(page)).toBeVisible();
  await expect(rail(page)).toBeVisible();

  expect(documents.length, documents.join('\n')).toBe(loads);
  expect(await page.evaluate(() => (window as Window & { boardProbe?: boolean }).boardProbe)).toBe(true);
});

test('a long queue shows five rows; Show all opens a drawer that Escape closes before leaving the pilot', async ({ page }) => {
  await serveBoard(page, 'full', longQueueBoard());
  await page.goto('/?character=9900000001');
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible({ timeout: 15_000 });
  const showAll = page.getByRole('button', { name: 'Show all 39 skills' });
  await expect(showAll).toBeVisible();
  await expect(sheet(page, 'Aurel Vantesse').getByText('Done', { exact: true })).toHaveCount(0);

  await showAll.click();
  const drawer = page.locator('[data-drawer-popup]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Aurel Vantesse · Skill queue' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible();
  await expect(page).toHaveURL(/character=9900000001/);

  await page.keyboard.press('Escape');
  await expect(overview(page)).toBeVisible();
});

test('a single-pilot account lands on that pilot’s sheet with no rail', async ({ page }) => {
  await serveBoard(page, 'one');
  await page.goto('/');
  await expect(sheet(page, 'Aurel Vantesse')).toBeVisible({ timeout: 15_000 });
  await expect(rail(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /All characters/ })).toHaveCount(0);
  await expect(sheet(page, 'Aurel Vantesse').getByRole('button', { name: 'Add character' })).toBeVisible();
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
