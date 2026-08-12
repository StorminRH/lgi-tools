export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  reducedMotion: true,
  async run({ page, check, shot }) {
    const wall = page.locator('[data-map-development-wall]');
    await wall.waitFor({ state: 'visible', timeout: 60_000 });
    check('development wall is visible', await wall.isVisible());
    check('canvas is absent for a signed-out visitor', await page.locator('[data-map-canvas]').count() === 0);
    check('floating chrome is absent for a signed-out visitor', await page.locator('[data-map-chrome]').count() === 0);
    check(
      'the walled atlas still uses the global site header',
      await page.locator('header.app-header').isVisible(),
    );

    await shot('development-wall');
  },
};
