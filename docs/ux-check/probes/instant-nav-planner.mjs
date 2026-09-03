export default {
  name: 'instant-nav-planner',
  route: '/industry',
  viewports: ['desktop'],
  settle: 1000,
  async run({ page, baseUrl, check, instant }) {
    await instant(async () => {
      await page.goto(new URL('/industry/691', baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const shell = page.locator('[data-page-shell]');
      check('planner shell mounts in the static shell', await shell.isVisible());
      const skeleton = page.getByRole('status', { name: /loading blueprint/i });
      const title = page.locator('h1.sr-only, [data-page-shell] h1').first();
      const hasSkeleton = (await skeleton.count()) > 0;
      const hasTitle = (await title.count()) > 0;
      check(
        'planner shows skeleton or structure title in the instant shell',
        hasSkeleton || hasTitle,
      );
    });
  },
};
