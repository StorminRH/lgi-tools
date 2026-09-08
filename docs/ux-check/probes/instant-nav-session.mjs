const ROUTES = [
  { path: '/skills', title: /skill queues/i },
  { path: '/characters', title: /^characters$/i },
  { path: '/settings', title: /account settings/i },
  { path: '/structures', title: /^structures$/i },
];

export default {
  name: 'instant-nav-session',
  get route() { return '/'; },
  viewports: ['desktop'],
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
      await page.getByRole('button', { name: /Log in with EVE Online/i }).first().waitFor({ state: 'visible', timeout: 30_000 });
      check(`${route.path} resolves on its exact route`, new URL(page.url()).pathname === route.path);
    }
  },
};
