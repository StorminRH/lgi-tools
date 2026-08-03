import {
  atlasWindowRoute,
  mapWindow,
  waitForWindowMap,
  WINDOW_STORAGE_KEY,
} from '../lib/window-helpers.mjs';

const closeEnough = (a, b) =>
  ['x', 'y', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 1);

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
    await page.evaluate((key) => localStorage.removeItem(key), WINDOW_STORAGE_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);
    const dock = mapWindow(page, 'dock');
    await dock.getByRole('button', { name: /Pop out Current system/ }).click();

    const drag = dock.locator('[data-map-window-drag]');
    const dragBox = await drag.boundingBox();
    if (dragBox !== null) {
      await page.mouse.move(dragBox.x + 40, dragBox.y + dragBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dragBox.x + 140, dragBox.y + 90, { steps: 6 });
      await page.mouse.up();
    }
    const resize = dock.locator('[data-map-window-resize]');
    const resizeBox = await resize.boundingBox();
    if (resizeBox !== null) {
      await page.mouse.move(resizeBox.x + 8, resizeBox.y + 8);
      await page.mouse.down();
      await page.mouse.move(resizeBox.x + 88, resizeBox.y + 68, { steps: 5 });
      await page.mouse.up();
    }
    const before = await dock.boundingBox();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);
    const restored = await dock.boundingBox();
    check(
      'the floating mode and exact rectangle restore directly after reload',
      before !== null && restored !== null && closeEnough(before, restored),
    );

    await dock.getByRole('button', { name: /Anchor Current system/ }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForWindowMap(page);
    check('re-anchoring survives reload as docked', await dock.getAttribute('data-map-window-placement') === 'docked');
    await dock.getByRole('button', { name: /Pop out Current system/ }).click();
    const remembered = await dock.boundingBox();
    check(
      'popping out again restores the retained floating rectangle',
      restored !== null && remembered !== null && closeEnough(restored, remembered),
    );
    await shot('restored-floating-window');
  },
};
