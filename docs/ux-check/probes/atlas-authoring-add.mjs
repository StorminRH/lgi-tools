// SC-2 / SC-6.1: node-bound Add connection… menu and destination search.
// Seeds a disposable system on UX_MAP_ID when the map is empty.
import {
  authoringMapId,
  authoringRoute,
  convexRun,
  openAddConnectionMenu,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const SEED_SYSTEM_ID = 30_000_142; // Jita — stable EVE id for fixture seed

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
      check('UX_BLANK_MAP_ID or UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);

    // If still blank (home not set), seed one system so the add menu can open.
    if ((await page.locator('[data-chain-node]').count()) === 0) {
      await convexRun('mapFixtures:placeSystemFixture', {
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
    // The popup positioner sits beside the virtual pointer anchor — a menu
    // opening anywhere else (e.g. a global fallback) fails the distance bound.
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
