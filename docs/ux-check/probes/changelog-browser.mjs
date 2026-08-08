const OLDER_SLUGS = ['v3.10', 'v3.9', 'v3.8', 'v3.7', 'v3.6', 'v3.4', 'v3.3', 'v3.2', 'v3.1', 'v3.0', 'v2.9'];
const STICKY_INSET = 24;
const TOLERANCE = 2;

function near(actual, expected) {
  return Math.abs(actual - expected) <= TOLERANCE;
}

export default {
  name: 'changelog-browser',
  route: '/changelog',
  viewports: ['desktop', 'mobile'],
  async run({ page, viewport, baseUrl, check, shot }) {
    if (viewport === 'mobile') {
      await page.goto(new URL('/changelog/v3.8', baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(300);
      const rail = page.locator('[data-content-browser-rail]');
      const trigger = page.locator('[data-drawer-trigger]');
      check('desktop changelog rail is hidden on mobile', !(await rail.isVisible()));
      check('mobile version chapter bar is visible', await trigger.isVisible());
      await trigger.tap();
      const popup = page.locator('[data-drawer-popup]');
      check('mobile version drawer opens', await popup.isVisible());
      check(
        'v3.8 is active on its canonical route',
        /^v3\.8\b/.test((await popup.locator('[aria-current="page"]').textContent()) ?? ''),
      );
      await shot('mobile-v3-8');
      return;
    }

    const navItems = page.locator('[data-content-browser-nav-item]');
    check('rail lists all twelve changelog masters', (await navItems.count()) === 12);
    const current = page.locator('[aria-current="page"]');
    check('current master v4.0 is active', /^v4\.0\b/.test((await current.textContent()) ?? ''));
    check('current master uses canonical /changelog href', (await current.getAttribute('href')) === '/changelog');
    check('visible master heading is v4.0', (await page.locator('[data-changelog-master-version]:visible').textContent()) === 'v4.0');
    await page.locator('[data-content-browser-rail]').evaluate((rail) => {
      rail.dataset.probeLayout = 'persisted';
    });
    await shot('desktop-landing');

    await page.locator('a[href="/changelog/v3.9"]').click();
    await page.waitForURL('**/changelog/v3.9');
    await page.waitForTimeout(300);
    check('soft navigation activates v3.9', /^v3\.9\b/.test((await page.locator('[aria-current="page"]').textContent()) ?? ''));
    check('v3.9 heading renders', (await page.locator('[data-changelog-master-version]:visible').textContent()) === 'v3.9');
    check(
      'shared layout survives soft navigation',
      (await page.locator('[data-content-browser-rail]').getAttribute('data-probe-layout')) === 'persisted',
    );
    check('v3.9 route has versioned metadata', /v3\.9.*Changelog/i.test(await page.title()));
    await shot('desktop-v3-9');

    // Cache Components streams a 200 App Shell before notFound() fires, so the
    // documented soft-404 contract is the injected noindex meta plus the
    // not-found boundary (node_modules/next/dist/docs streaming.md), not the
    // HTTP status the pre-16.3 structure produced.
    for (const slug of ['v4.0', 'v9.9']) {
      const response = await page.request.get(new URL(`/changelog/${slug}`, baseUrl).href);
      const body = await response.text();
      check(
        `${slug} alias streams the noindex not-found document`,
        /name="robots" content="noindex"/.test(body) && body.includes('Nothing on D-Scan'),
      );
    }
    const sitemap = await page.request.get(new URL('/sitemap.xml', baseUrl).href);
    check('sitemap loads', sitemap.ok());
    const sitemapXml = await sitemap.text();
    check('sitemap includes canonical /changelog', /<loc>[^<]+\/changelog<\/loc>/.test(sitemapXml));
    for (const slug of OLDER_SLUGS) {
      check(
        `sitemap includes /changelog/${slug}`,
        new RegExp(`<loc>[^<]+/changelog/${slug.replace('.', '\\.')}<\\/loc>`).test(sitemapXml),
      );
    }
    check('sitemap excludes the current-master alias', !/<loc>[^<]+\/changelog\/v4\.0<\/loc>/.test(sitemapXml));

    await page.setViewportSize({ width: 1100, height: 300 });
    await page.goto(new URL('/changelog/v3.9', baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(300);
    const rail = page.locator('[data-content-browser-rail]');
    const body = page.locator('[data-content-browser-rail-body]');
    const initialTop = await rail.evaluate((element) => element.getBoundingClientRect().top);
    check('compact rail begins below its sticky stop', initialTop > STICKY_INSET);
    await page.evaluate((top) => window.scrollTo(0, top), initialTop);
    await page.waitForTimeout(300);
    const stuckTop = await rail.evaluate((element) => element.getBoundingClientRect().top);
    check('compact rail sticks at 24px', near(stuckTop, STICKY_INSET));
    const dimensions = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    check('compact rail overflows internally', dimensions.scrollHeight > dimensions.clientHeight);
    await body.hover();
    const windowBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(300);
    check('wheel scrolls the compact rail', (await body.evaluate((element) => element.scrollTop)) > 0);
    check('internal rail scroll leaves the page still', (await page.evaluate(() => window.scrollY)) === windowBefore);
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const chainBefore = await page.evaluate(() => window.scrollY);
    await body.hover();
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(300);
    check('rail boundary chains scrolling to the page', (await page.evaluate(() => window.scrollY)) > chainBefore);
    await shot('desktop-compact');
  },
};
