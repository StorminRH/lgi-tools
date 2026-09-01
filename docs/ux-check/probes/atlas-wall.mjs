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
    check(
      'header login stays on the signed-out landing',
      await page.getByRole('button', { name: /Log in with EVE Online/i }).isVisible(),
    );

    await page.goto(new URL('/atlas?map=shared-map', page.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.locator('[data-map-catalogue]').waitFor({ state: 'visible', timeout: 60_000 });
    check(
      'a shared map link keeps signed-out visitors on the catalogue',
      await page.locator('[data-map-catalogue]').isVisible(),
    );
    check(
      'a shared map link does not cover the header with the canvas',
      (await page.locator('[data-map-canvas-frame]').count()) === 0,
    );
    check(
      'a shared map link still exposes header login',
      await page.getByRole('button', { name: /Log in with EVE Online/i }).isVisible(),
    );
  },
};
