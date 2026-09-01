/**
 * Signed-out Atlas landing: the public catalogue and site header, not an
 * administrator development wall. A shared `?map=` URL must not cover that
 * header, because the canvas omits login when there is no session.
 */
export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  reducedMotion: true,
  async run({ page, viewport, check }) {
    async function loginReachable(label) {
      const login = page.getByRole('button', { name: /Log in with EVE Online/i });
      if (viewport === 'desktop') {
        await login.waitFor({ state: 'visible', timeout: 15_000 });
        check(label, await login.isVisible());
        return;
      }
      const toggle = page.locator('[data-nav-menu-toggle]');
      await toggle.click();
      const panel = page.locator('[data-nav-menu-panel]');
      await panel.waitFor({ state: 'visible', timeout: 5_000 });
      await panel.getByRole('button', { name: /Log in with EVE Online/i }).waitFor({
        state: 'visible',
        timeout: 15_000,
      });
      check(
        label,
        await panel.getByRole('button', { name: /Log in with EVE Online/i }).isVisible(),
      );
      await page.keyboard.press('Escape');
    }

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
    await loginReachable('header login stays on the signed-out landing');

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
    await loginReachable('a shared map link still exposes header login');
  },
};
