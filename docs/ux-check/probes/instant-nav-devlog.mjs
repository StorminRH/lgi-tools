/**
 * Soft-nav Instant Navigations guard: /devlog landing → a document slug keeps
 * the shared content-browser chrome (head + rail) in the instant shell while
 * the slug-bound document streams from Suspense.
 */
export default {
  name: 'instant-nav-devlog',
  route: '/devlog',
  viewports: ['desktop'],
  settle: 2000,
  async run({ page, check, instant }) {
    const heading = page.getByRole('heading', { level: 1 }).first();
    check(
      'devlog PageHead is present',
      /under the hood/i.test((await heading.textContent()) ?? ''),
    );

    const rail = page.locator('[data-content-browser-rail]');
    check('devlog rail is present', await rail.isVisible());

    const docLink = rail.locator('a[href^="/devlog/"]').first();
    await docLink.waitFor({ state: 'attached', timeout: 10000 });
    check('devlog rail exposes a document link', (await docLink.count()) > 0);
    const href = await docLink.getAttribute('href');

    await instant(async () => {
      await docLink.click();
      await page.waitForURL((url) => url.pathname.startsWith('/devlog/'), {
        timeout: 15000,
      });
      check(
        'devlog head survives soft navigation',
        /under the hood/i.test(
          (await page.getByRole('heading', { level: 1 }).first().textContent()) ?? '',
        ),
      );
      check(
        'devlog rail survives soft navigation',
        await page.locator('[data-content-browser-rail]').isVisible(),
      );
      const skeleton = page.getByRole('status', { name: /loading document/i });
      const docTitle = page.locator('[data-content-browser-main] h1, article h1, .prose h1').first();
      const hasSkeleton = (await skeleton.count()) > 0;
      const hasDoc = (await docTitle.count()) > 0;
      check(
        'document skeleton or body is in the instant shell',
        hasSkeleton || hasDoc,
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
