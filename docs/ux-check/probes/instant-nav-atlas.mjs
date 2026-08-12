/**
 * Instant Navigations guard: /atlas must show the site header and Atlas
 * PageHead rather than a blank viewport or the development wall while the
 * administrator gate resolves. Uses the initial-load form of instant() —
 * atlas is reachable by URL while remaining off the public tool strip.
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
      check(
        'atlas keeps the global site header in the instant shell',
        await page.locator('header.app-header').isVisible(),
      );
      const shell = page.locator('[data-page-shell]');
      check(
        'atlas paints the PageHead shell while the gate resolves',
        await shell.isVisible(),
      );
      const shellText = (await shell.textContent()) ?? '';
      check(
        'atlas paints lgi://atlas while the gate resolves',
        /lgi:\/\/atlas/i.test(shellText),
      );
      check(
        'atlas paints the Atlas title while the gate resolves',
        /Atlas/.test((await shell.locator('h1').textContent()) ?? ''),
      );
      check(
        'the development wall is not the loading shell',
        (await page.locator('[data-map-development-wall]').count()) === 0,
      );
    });
  },
};
