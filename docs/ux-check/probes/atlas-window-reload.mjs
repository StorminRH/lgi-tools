import {
  atlasWindowRoute,
  mapWindow,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-window-reload',
  get route() { return atlasWindowRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  async run({ page, check }) {
    if (!process.env.UX_MAP_ID) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
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

  },
};
