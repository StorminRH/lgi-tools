import {
  authoringMapId,
  authoringRoute,
  convexRun,
  openAddConnectionMenu,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const SEED_SYSTEM_ID = 30_000_142;

export default {
  name: 'atlas-authoring-add',
  route: authoringRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, shot }) {
    const mapId = authoringMapId();
    if (!mapId) {
      check('UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);

    if ((await page.locator('[data-chain-node]').count()) === 0) {
      await convexRun('mapFixturePlace:placeSystemFixture', {
        mapId,
        systemId: SEED_SYSTEM_ID,
      });
      await page.waitForFunction(
        () => document.querySelectorAll('[data-chain-node]').length >= 1,
        null,
        { timeout: 30_000 },
      );
    }

    const clickPoint = await openAddConnectionMenu(page);
    const menuItem = page.getByRole('menuitem', { name: 'Add connection…' });
    const menuBox = await menuItem.boundingBox();
    const nearPointer =
      clickPoint !== null
      && menuBox !== null
      && Math.hypot(
        menuBox.x + menuBox.width / 2 - clickPoint.x,
        menuBox.y + menuBox.height / 2 - clickPoint.y,
      ) <= 160;
    check('node-bound Add connection… menu opens at the pointer', nearPointer);
    await shot('node-add-menu');

    await page.getByRole('menuitem', { name: 'Add connection…' }).click();
    const search = page.locator('[data-map-node-add-search]');
    await search.waitFor({ state: 'visible', timeout: 10_000 });
    check('destination system search dialog opens', await search.isVisible());
    check(
      'destination placeholder is present',
      (await page.getByPlaceholder('Destination system — type a name').count()) === 1,
    );
    await shot('node-add-search');
  },
};
