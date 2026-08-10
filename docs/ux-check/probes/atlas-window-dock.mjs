import {
  atlasWindowRoute,
  clickExposedPane,
  mapWindow,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-window-dock',
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

    const dials = page.locator('[data-map-dev-dials]');
    if (await dials.count()) {
      await page.getByText('Layout dials').click();
      check(
        'the bottom-right dial group opens with the chrome chips',
        (await page.getByText('Ring spacing').isVisible())
          && (await dials.getAttribute('data-position')) !== 'bottom-left',
      );
    } else {
      check('dev layout dials are absent outside development (expected)', true);
    }
    await shot('standing-dock');
  },
};
