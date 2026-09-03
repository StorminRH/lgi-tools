export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  reducedMotion: true,
  async run({ page, viewport, check }) {
    const ssoButton = { name: /Log in with EVE Online/i };

    async function headerLoginReachable(label) {
      if (viewport === 'desktop') {
        const login = page.locator('header.app-header').getByRole('button', ssoButton);
        await login.waitFor({ state: 'visible', timeout: 15_000 });
        check(label, await login.isVisible());
        return;
      }
      const toggle = page.locator('[data-nav-menu-toggle]');
      await toggle.click();
      const panel = page.locator('[data-nav-menu-panel]');
      await panel.waitFor({ state: 'visible', timeout: 5_000 });
      const login = panel.getByRole('button', ssoButton);
      await login.waitFor({ state: 'visible', timeout: 15_000 });
      check(label, await login.isVisible());
      await page.keyboard.press('Escape');
    }

    async function guestLanding(label) {
      const landing = page.locator('[data-atlas-guest-landing]');
      await landing.waitFor({ state: 'visible', timeout: 60_000 });
      check(`${label}: signed-out Atlas renders the guest landing`, await landing.isVisible());
      check(
        `${label}: the catalogue and its controls stay off`,
        (await page.locator('[data-map-catalogue], [data-map-catalogue-create], [data-map-catalogue-trash]').count()) === 0,
      );
      check(
        `${label}: canvas is absent`,
        (await page.locator('[data-map-canvas], [data-map-canvas-frame]').count()) === 0,
      );
      check(
        `${label}: floating chrome is absent`,
        (await page.locator('[data-map-chrome]').count()) === 0,
      );
      check(
        `${label}: the landing carries its own EVE sign-in`,
        await landing.getByRole('button', ssoButton).isVisible(),
      );
      check(
        `${label}: the landing lists the tracking setup`,
        (await page.locator('[data-atlas-guest-steps] li').count()) === 3,
      );
      return landing;
    }

    await guestLanding('landing');
    check(
      'development wall is gone',
      (await page.locator('[data-map-development-wall]').count()) === 0,
    );
    check(
      'the public atlas uses the global site header',
      await page.locator('header.app-header').isVisible(),
    );
    check(
      'header tools include Atlas',
      (await page.locator('a[href="/atlas"]').count()) > 0,
    );
    await headerLoginReachable('header login stays on the signed-out landing');

    await page.goto(new URL('/atlas?map=shared-map', page.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await guestLanding('shared map link');
    await headerLoginReachable('a shared map link still exposes header login');
  },
};
