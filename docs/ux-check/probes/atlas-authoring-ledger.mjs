// SC-4 / SC-6.1: bottom-edge map-event ledger mounts and expands.
import {
  authoringMapId,
  authoringRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-authoring-ledger',
  route: authoringRoute(),
  viewports: ['desktop', 'mobile'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 1500,
  async run({ page, check, shot }) {
    const mapId = authoringMapId();
    if (!mapId) {
      check('UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);

    const log = page.locator('[data-map-event-log]');
    check('map event ledger mounts', await log.isVisible());
    check(
      'Log toggle is present',
      (await log.locator('[data-map-event-log-toggle]').count()) === 1,
    );

    const details = log.locator('details[data-collapsible]');
    if ((await details.count()) === 1 && !(await details.evaluate((el) => el.open))) {
      await log.locator('summary').click();
      await page.waitForTimeout(200);
    }

    // `count()` alone passes on a closed <details> (children stay in the DOM);
    // assert the open state and actual visibility of the revealed region.
    check(
      'ledger details element is open after the summary click',
      (await details.count()) === 1 && (await details.evaluate((el) => el.open)),
    );
    check(
      'expanded ledger shows rows or empty state',
      (await log.locator('[data-map-event-log-rows]').isVisible()) &&
        ((await log.locator('[data-map-event-log-empty]').isVisible()) ||
          (await log.locator('[data-map-event-row]').count()) >= 1),
    );

    await shot('map-event-log');
  },
};
