/**
 * Signed-out Atlas landing: the public catalogue and site header, not an
 * administrator development wall.
 */
export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  reducedMotion: true,
  async run({ page, check }) {
    const catalogue = page.locator('[data-map-catalogue]');
    await catalogue.waitFor({ state: 'visible', timeout: 60_000 });
    check('signed-out Atlas renders the catalogue', await catalogue.isVisible());
    check(
      'development wall is gone',
      (await page.locator('[data-map-development-wall]').count()) === 0,
    );
    check(
      'canvas is absent without a selected map',
      (await page.locator('[data-map-canvas]').count()) === 0,
    );
    check(
      'floating chrome is absent on the landing',
      (await page.locator('[data-map-chrome]').count()) === 0,
    );
    check(
      'the public atlas uses the global site header',
      await page.locator('header.app-header').isVisible(),
    );
    check(
      'header tools include Atlas',
      (await page.locator('a[href="/atlas"]').count()) > 0,
    );
  },
};
