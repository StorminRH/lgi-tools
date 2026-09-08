import {
  atlasWindowRoute,
  exposedPanePoint,
  flowViewport,
  mapWindow,
  openSummary,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';


export default {
  name: 'atlas-window-stacking',
  get route() { return atlasWindowRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  async run({ page, check }) {
    if (!process.env.UX_MAP_ID) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
    await waitForWindowMap(page);
    const dock = mapWindow(page, 'dock');
    const node = await openSummary(page);
    const card = mapWindow(page, 'summary');
    check(
      'persistent dock and summary card coexist',
      node !== null && await dock.isVisible() && await card.isVisible(),
    );

    await page.locator('[data-account-menu-trigger]').click();
    const menu = page.locator('[data-account-menu-popup]');
    await menu.waitFor({ state: 'visible', timeout: 5000 });
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

  },
};
