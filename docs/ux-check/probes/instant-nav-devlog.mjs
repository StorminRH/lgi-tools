/**
 * Soft-nav Instant Navigations guard: /devlog landing → a document slug keeps
 * the shared content-browser chrome (head + rail) in the instant shell.
 */
export default {
  name: 'instant-nav-devlog',
  route: '/devlog',
  viewports: ['desktop'],
  settle: 2000,
  async run({ page, check, instant }) {
    const heading = page.getByRole('heading', { level: 1 });
    check(
      'devlog PageHead is present',
      /under the hood/i.test((await heading.first().textContent()) ?? ''),
    );

    const docLink = page.locator('[data-content-browser-nav-item] a[href^="/devlog/"]').first();
    if ((await docLink.count()) === 0) {
      check('devlog rail exposes a document link', false);
      return;
    }
    check('devlog rail exposes a document link', true);
    const href = await docLink.getAttribute('href');

    await instant(async () => {
      await docLink.click();
      await page.waitForURL((url) => url.pathname.startsWith('/devlog/'), {
        timeout: 15000,
      });
      check(
        'devlog head survives soft navigation',
        /under the hood/i.test((await page.getByRole('heading', { level: 1 }).first().textContent()) ?? ''),
      );
      check(
        'devlog rail survives soft navigation',
        await page.locator('[data-content-browser-rail]').isVisible(),
      );
      if (href) {
        check(
          `landed on ${href}`,
          new URL(page.url()).pathname === new URL(href, 'http://local.invalid').pathname,
        );
      }
    });
  },
};
