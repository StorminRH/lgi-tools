import {
  atlasWindowRoute,
  exposedPanePoint,
  flowViewport,
  mapWindow,
  openSummary,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

const z = (locator) => locator.evaluate((element) => Number(getComputedStyle(element).zIndex));

export default {
  name: 'atlas-window-stacking',
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
    const node = await openSummary(page);
    const card = mapWindow(page, 'summary');
    check(
      'persistent dock and summary card coexist',
      node !== null && await dock.isVisible() && await card.isVisible(),
    );

    const before = { dock: await z(dock), card: await z(card) };
    await dock.locator('header').click();
    await page.waitForTimeout(50);
    const after = { dock: await z(dock), card: await z(card) };
    check(
      'pointer-down brings the lower window to the front',
      before.card > before.dock && after.dock > after.card,
    );

    await page.getByRole('button', { name: 'Atlas menu' }).click();
    const menu = page.locator('[data-map-menu-panel]');
    await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check('the chrome popup opens above the windows', await menu.isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    check('the first Escape closes only the popup', !(await menu.isVisible()) && await card.isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    check(
      'the next Escape dismisses only the card and leaves the readout',
      !(await card.isVisible()) && await dock.isVisible(),
    );

    const panePoint = await exposedPanePoint(page);
    const beforePan = await flowViewport(page).evaluate((element) => element.style.transform);
    if (panePoint !== null) {
      await page.mouse.move(panePoint.x, panePoint.y);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(panePoint.x + 70, panePoint.y + 30, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    }
    const afterPan = await flowViewport(page).evaluate((element) => element.style.transform);
    check('the exposed canvas remains interactive beside a window', beforePan !== afterPan);
    await shot('stacking-and-popup-arbitration');
  },
};
