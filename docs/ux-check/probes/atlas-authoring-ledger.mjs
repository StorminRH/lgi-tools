import {
  authoringMapId,
  authoringRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const subscriptions = new WeakMap();

export default {
  name: 'atlas-authoring-ledger',
  route: authoringRoute(),
  viewports: ['desktop', 'mobile'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 1500,
  async setup({ page }) {
    const active = new Set();
    subscriptions.set(page, active);
    page.on('websocket', (socket) => {
      const owned = new Set();
      socket.on('framesent', ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.type !== 'ModifyQuerySet') return;
        for (const change of message.modifications) {
          if (change.type === 'Add' && change.udfPath === 'mapChainEvents:watchMapEvents') {
            owned.add(change.queryId);
            active.add(change.queryId);
          } else if (change.type === 'Remove') {
            owned.delete(change.queryId);
            active.delete(change.queryId);
          }
        }
      });
      socket.on('close', () => {
        for (const id of owned) active.delete(id);
      });
    });
  },
  async run({ page, viewport, check }) {
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
    const toggle = async () => {
      if (viewport === 'mobile') {
        await log.locator('summary').focus();
        await log.locator('summary').press('Enter');
      } else {
        await log.locator('summary').click();
      }
    };
    check('ledger starts collapsed', !(await details.evaluate((el) => el.open)));
    check('collapsed ledger omits detail rows and count',
      await log.locator('[data-map-event-log-rows], [data-map-event-log-count]').count() === 0);
    check('collapsed ledger has no event subscription', subscriptions.get(page).size === 0);
    if ((await details.count()) === 1 && !(await details.evaluate((el) => el.open))) {
      await toggle();
      await log.locator('[data-map-event-log-count]').waitFor();
    }

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
    check('expanded ledger has one event subscription', subscriptions.get(page).size === 1);

    await toggle();
    await log.locator('[data-map-event-log-rows]').waitFor({ state: 'detached' });
    check('closing releases rendered details and count',
      await log.locator('[data-map-event-log-count]').count() === 0);
    await page.waitForTimeout(200);
    check('closing releases the event subscription', subscriptions.get(page).size === 0);
    await toggle();
    await log.locator('[data-map-event-log-count]').waitFor();
    check('reopening loads the current ledger',
      await log.locator('[data-map-event-log-rows]').isVisible());
    check('reopening restores one event subscription', subscriptions.get(page).size === 1);
  },
};
