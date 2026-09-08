import {
  atlasWindowRoute,
  clickExposedPane,
  mapWindow,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-window-dock',
  get route() { return atlasWindowRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  async run({ page, check }) {
    if (!process.env.UX_MAP_ID) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
    await waitForWindowMap(page);

    const dock = mapWindow(page, 'dock');
    check('the current-system readout stands on load', await dock.isVisible());
    check(
      'the readout stays docked without pop-out or close controls',
      (await dock.getAttribute('data-map-window-placement')) === 'docked'
        && (await dock.getAttribute('data-map-window-appearance')) === 'overlay'
        && (await dock.getByRole('button', { name: /Pop out/ }).count()) === 0
        && (await dock.getByRole('button', { name: /Close / }).count()) === 0,
    );
    check(
      'the readout is click-through (nodes beneath stay reachable)',
      (await dock.evaluate((element) => getComputedStyle(element).pointerEvents)) === 'none',
    );
    check('an exposed canvas point is available', await clickExposedPane(page));
    await page.keyboard.press('Escape');
    check('pane click and Escape leave the readout standing', await dock.isVisible());

  },
};
