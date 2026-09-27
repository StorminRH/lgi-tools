import { expect, type Page, test } from '@playwright/test';
import { assembleBoardCharacter } from '@/composition/board/board-assemble';
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
  await expect(page.getByText('Not counted: blueprints, SKINs, PLEX in your PLEX vault, and items without a price.')).toBeVisible();
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

  await pilot(page, 9_900_000_002).click();
  await expect(sheet(page, 'Kessa Draymoor')).toBeVisible();
  await page.locator('header a[href="/"]').first().click();
  await expect(page).not.toHaveURL(/character=/);
  await expect(overview(page)).toBeVisible();
  await expect(sheet(page, 'Kessa Draymoor')).toHaveCount(0);

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

test('net worth appears after assets finish syncing without a reload', async ({ page }) => {
  const ready = buildDemoBoard(FIXTURE_NOW, 'full');
  const pending = structuredClone(ready);
  for (const character of pending.characters) {
    if (character.netWorth.state === 'ready') character.netWorth = { state: 'pending' };
  }
  let assetsSynced = false;
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route('**/api/account/board', (route) => {
    return route.fulfill({ json: assetsSynced ? ready : pending });
  });
  await page.goto('/');
  await expect(overview(page)).toBeVisible({ timeout: 15_000 });
  const chart = overview(page).getByRole('img', { name: 'Estimated net worth over time' });
  await expect(chart).toHaveCount(0);
  assetsSynced = true;
  await page.clock.runFor(4_000);
  await expect(chart).toBeVisible();
  await expect(overview(page).getByText('7.75B', { exact: false }).first()).toBeVisible();
});

test('the sheet shows ESI attribute totals and a flat history for an inactive wallet', async ({ page }) => {
  const board = buildDemoBoard(FIXTURE_NOW, 'one');
  const character = board.characters[0]!;
  const refreshedAt = new Date(FIXTURE_NOW).toISOString();
  const assembled = assembleBoardCharacter({
    identity: {
      characterId: character.characterId, name: character.name, portraitUrl: character.portraitUrl,
      corporationId: character.corporation?.id ?? null, allianceId: character.alliance?.id ?? null,
    },
    health: { hasRefreshToken: true, missingScopes: [] },
    sheet: {
      attributes: {
        refreshedAt, etags: {},
        data: { attributes: {
          intelligence: 25, memory: 21, perception: 17, willpower: 17, charisma: 17,
          bonusRemaps: 1, lastRemapDate: null, accruedRemapCooldownDate: null,
        } },
      },
      implants: { refreshedAt, etags: {}, data: { implants: [10222] } },
    },
    skills: { data: null, levels: null, refreshedAt: null },
    jobs: { data: null, refreshedAt: null },
    assets: { rows: null, refreshedAt: null },
  }, {
    types: new Map([[10222, { name: 'Cybernetic Subprocessor', implantSlot: 4, attributeBonus: { intelligence: 4 } }]]),
    systems: new Map(), npcStations: new Map(), entities: {}, skillCatalog: [], prices: new Map(), typeCategories: new Map(),
  }, FIXTURE_NOW);
  character.attributes = assembled.attributes;
  character.wallet = { state: 'ready', refreshedAt: FIXTURE_NOW, data: { balance: 1_000_000_000 } };
  character.journal = {
    state: 'ready', refreshedAt: FIXTURE_NOW,
    data: { windowStart: '2026-09-01T00:00:00Z', inflow: 0, outflow: 0, series: [], recent: [] },
  };
  board.history = [];
  await serveBoard(page, 'one', board);
  await page.goto('/');
  const intelligence = page.locator('dt').filter({ hasText: /^Intelligence$/ }).locator('..').locator('dd');
  await expect(intelligence).toHaveText('25(+4)');
  const chart = page.getByRole('img', { name: 'Estimated net worth over time' });
  await expect(chart).toBeVisible();
  await page.getByLabel('Estimated net worth over time; use the arrow keys to read each day', { exact: true }).focus();
  for (let day = 0; day < 26; day += 1) await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sparkline-tooltip').getByText('1 Sept 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('ISK 1.00B', { exact: true })).toBeVisible();
});
