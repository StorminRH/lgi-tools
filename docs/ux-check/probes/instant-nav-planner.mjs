export default {
  name: 'instant-nav-planner',
  get route() { return '/industry'; },
  viewports: ['desktop'],
  async run({ page, baseUrl, check, instant }) {
    await instant(async () => {
      await page.goto(new URL('/industry/691', baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const shell = page.locator('[data-page-shell]');
      check('planner shell mounts in the static shell', await shell.isVisible());
      const skeleton = page.getByRole('status', { name: /loading blueprint/i });
      check('planner exposes its loading blueprint status while dynamic work is held', await skeleton.isVisible());
    });
    await page.getByPlaceholder('Build system — type a name').waitFor({ state: 'visible', timeout: 30_000 });
    check('Rifter planner resolves on the exact route', new URL(page.url()).pathname === '/industry/691');
  },
};
