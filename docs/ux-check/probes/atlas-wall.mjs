export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  reducedMotion: true,
  async run({ page, check, shot }) {
    const wall = page.locator('[data-map-development-wall]');
    check('development wall is visible', await wall.isVisible());
    check('canvas is absent for a signed-out visitor', await page.locator('[data-map-canvas]').count() === 0);
    check('floating chrome is absent for a signed-out visitor', await page.locator('[data-map-chrome]').count() === 0);

    const viewport = await page.evaluate(() => ({
      innerHeight: window.innerHeight,
      bodyHeight: document.body.scrollHeight,
      rootHeight: document.documentElement.scrollHeight,
    }));
    check(
      'development wall does not introduce page scroll',
      viewport.bodyHeight <= viewport.innerHeight && viewport.rootHeight <= viewport.innerHeight,
    );

    await shot('development-wall');
  },
};
