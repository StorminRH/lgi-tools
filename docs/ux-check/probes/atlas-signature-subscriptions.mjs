import {
  atlasWindowRoute,
  mapWindow,
  hittableNode,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

const subscriptions = new WeakMap();

export default {
  name: 'atlas-signature-subscriptions',
  route: atlasWindowRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2000,
  async setup({ page }) {
    const active = new Map();
    subscriptions.set(page, active);
    page.on('websocket', (socket) => {
      const owned = new Set();
      socket.on('framesent', ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.type !== 'ModifyQuerySet') return;
        for (const change of message.modifications) {
          if (change.type === 'Add' && change.udfPath === 'mapScan:watchSystemSignatures') {
            owned.add(change.queryId);
            active.set(change.queryId, change.args[0]);
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
  async run({ page, check }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID names the live fixture', false);
      return;
    }
    await waitForWindowMap(page);
    const active = subscriptions.get(page);
    const initial = [...active.values()];
    check('scanner and dock share one scoped first page', initial.length === 1);
    check('signature request includes map and system', initial.every((args) =>
      args.mapId === process.env.UX_MAP_ID && typeof args.systemId === 'number'));

    const node = await hittableNode(page, {
      excludeIds: initial.map((args) => String(args.systemId)),
    });
    if (node !== null) await page.mouse.click(node.point.x, node.point.y);
    const summary = mapWindow(page, 'summary');
    await summary.waitFor({ state: 'visible' });
    check('a second intelligence window opens', node !== null && await summary.isVisible());
    await page.waitForTimeout(500);
    const opened = [...active.values()];
    check('only the scanner and selected system subscribe', opened.length === 2
      && new Set(opened.map((args) => args.systemId)).size === 2);
    await page.keyboard.press('Escape');
    await summary.waitFor({ state: 'detached' });
    await page.waitForTimeout(200);
    const closed = [...active.values()];
    check('closing the second window releases its subscription', closed.length === 1
      && closed[0].systemId === initial[0]?.systemId);
  },
};
