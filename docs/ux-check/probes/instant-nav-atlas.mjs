/**
 * Instant Navigations guard: /atlas must show a chrome-shaped shell (development
 * wall or map frame) rather than a blank viewport while the admin gate resolves.
 * Uses the initial-load form of instant() — atlas is outside the public soft-nav strip.
 */
export default {
  name: 'instant-nav-atlas',
  route: '/',
  viewports: ['desktop'],
  settle: 800,
  async run({ page, baseUrl, check, instant }) {
    await instant(async () => {
      await page.goto(new URL('/atlas', baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const wall = page.locator('[data-map-development-wall]');
      const chrome = page.locator('[data-map-chrome]');
      const hasWall = (await wall.count()) > 0 && (await wall.isVisible());
      const hasChrome = (await chrome.count()) > 0;
      check(
        'atlas shows wall or map chrome in the static shell (not blank)',
        hasWall || hasChrome,
      );
      if (hasWall) {
        check(
          'development wall heading is visible',
          /mapping the unknown/i.test((await wall.locator('h1').textContent()) ?? ''),
        );
      }
    });
  },
};
