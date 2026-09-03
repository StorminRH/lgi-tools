const ROUTES = [
  { path: '/skills', title: /skill queues/i },
  { path: '/characters', title: /^characters$/i },
  { path: '/settings', title: /account settings/i },
  { path: '/structures', title: /^structures$/i },
];

export default {
  name: 'instant-nav-session',
  route: '/',
  viewports: ['desktop'],
  settle: 800,
  async run({ page, baseUrl, check, instant }) {
    for (const route of ROUTES) {
      await instant(async () => {
        await page.goto(new URL(route.path, baseUrl).href, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        const heading = page.getByRole('heading', { level: 1 }).first();
        const text = ((await heading.textContent()) ?? '').trim();
        check(
          `${route.path} PageHead is in the static shell (${text || 'missing'})`,
          route.title.test(text),
        );
      });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  },
};
