/**
 * Soft-nav Instant Navigations guard: home → /sites App Shell (heading + filter
 * chrome) must paint without waiting on dynamic streams.
 */
export default {
  name: 'instant-nav-sites',
  route: '/',
  viewports: ['desktop'],
  settle: 1500,
  async run({ page, check, instant }) {
    const sitesLink = page.locator('a[href="/sites"]').first();
    check('home exposes a /sites link', (await sitesLink.count()) > 0);

    await instant(async () => {
      await sitesLink.click();
      await page.waitForURL((url) => url.pathname === '/sites', { timeout: 15000 });
      const shell = page.locator('[data-page-shell]');
      check('sites shell mounts instantly', await shell.isVisible());
      const heading = page.getByRole('heading', { level: 1 });
      check(
        'sites heading is in the instant shell',
        (await heading.count()) > 0 && (await heading.first().isVisible()),
      );
    });

    check('landed on /sites', new URL(page.url()).pathname === '/sites');
  },
};
