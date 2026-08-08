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
      const heading = page.getByRole('heading', { level: 1 }).first();
      const text = ((await heading.textContent()) ?? '').trim();
      check(
        `sites heading is in the instant shell (${text || 'missing'})`,
        /wormhole sites/i.test(text),
      );
      check(
        'sites workspace shell mounts instantly',
        await page.locator('[data-page-shell-mode="workspace"]').first().isVisible(),
      );
    });

    check('landed on /sites', new URL(page.url()).pathname === '/sites');
  },
};
