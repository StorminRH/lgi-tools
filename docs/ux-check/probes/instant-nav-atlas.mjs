export default {
  name: 'instant-nav-atlas',
  route: '/',
  viewports: ['desktop'],
  settle: 800,
  async run({ page, check, instant }) {
    const atlasLink = page.locator('nav[aria-label="Tools"] a[href="/atlas"]').first();
    check('home header exposes Atlas', (await atlasLink.count()) > 0);

    await instant(async () => {
      await atlasLink.click();
      await page.waitForURL((url) => url.pathname === '/atlas', { timeout: 15000 });
      check(
        'atlas keeps the global site header in the instant shell',
        await page.locator('header.app-header').isVisible(),
      );
      const shell = page.locator('[data-page-shell-mode="workspace"]').first();
      check(
        'atlas paints the PageHead shell while the listing resolves',
        await shell.isVisible(),
      );
      const shellText = (await shell.textContent()) ?? '';
      check(
        'atlas paints lgi://atlas while the listing resolves',
        /lgi:\/\/atlas/i.test(shellText),
      );
      check(
        'atlas paints the Atlas title while the listing resolves',
        /Atlas/.test((await shell.locator('h1').textContent()) ?? ''),
      );
      check(
        'the development wall is not the loading shell',
        (await page.locator('[data-map-development-wall]').count()) === 0,
      );
    });

    check('landed on /atlas', new URL(page.url()).pathname === '/atlas');
  },
};
