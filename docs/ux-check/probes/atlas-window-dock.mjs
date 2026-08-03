import {
  atlasWindowRoute,
  clickExposedPane,
  hittableNode,
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
    await page.evaluate(() => localStorage.removeItem('lgi:map:windows:v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);

    const dock = page.locator('[data-map-window="dock"]');
    check('the current-system dock stands on load', await dock.isVisible());
    check('an exposed canvas point is available', await clickExposedPane(page));
    await page.keyboard.press('Escape');
    check('pane click and Escape leave the dock standing', await dock.isVisible());

    await dock.getByRole('button', { name: /Close Current system/ }).click();
    check('the close control hides the dock in memory', !(await dock.isVisible()));
    const root = await hittableNode(page);
    check('the root node is hittable', root !== null);
    if (root !== null) await page.mouse.click(root.point.x, root.point.y);
    check('a root click reopens the hidden dock', await dock.isVisible());

    const lock = page.getByRole('switch', { name: 'Map lock' });
    const wasLocked = await lock.isChecked();
    await lock.click();
    check('the relocated top-left lock remains operable', (await lock.isChecked()) !== wasLocked);
    await page.getByText('Layout dials').click();
    check('the relocated dial group opens beside the dock', await page.getByText('Ring spacing').isVisible());
    await shot('standing-dock');
  },
};
