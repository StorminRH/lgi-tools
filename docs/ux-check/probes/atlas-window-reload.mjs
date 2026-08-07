import {
  atlasWindowRoute,
  mapWindow,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-window-reload',
  route: atlasWindowRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }
    await waitForWindowMap(page);
    const dock = mapWindow(page, 'dock');
    check(
      'the current-system readout is docked overlay before reload',
      (await dock.getAttribute('data-map-window-placement')) === 'docked'
        && (await dock.getAttribute('data-map-window-appearance')) === 'overlay',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);
    check(
      'the readout remains a persistent docked overlay after reload',
      await dock.isVisible()
        && (await dock.getAttribute('data-map-window-placement')) === 'docked'
        && (await dock.getAttribute('data-map-window-appearance')) === 'overlay',
    );
    await shot('persistent-system-readout');
  },
};
