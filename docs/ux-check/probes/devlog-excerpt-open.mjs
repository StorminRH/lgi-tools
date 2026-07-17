const ROUTES = ['/devlog/neon', '/devlog/search'];

export default {
  name: 'devlog-excerpt-open',
  route: ROUTES[0],
  viewports: ['desktop', 'mobile'],
  settle: 800,
  async run({ page, viewport, baseUrl, check, shot }) {
    let permalinkCount = 0;
    for (const [index, route] of ROUTES.entries()) {
      if (index > 0) {
        await page.goto(new URL(route, baseUrl).href, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await page.waitForTimeout(800);
      }
      const opened = await page.$$eval('details.devlog-excerpt', (elements) => {
        for (const element of elements) element.open = true;
        return elements.length;
      });
      const gutters = await page.locator('.devlog-excerpt-gutter').count();
      const coloredTokens = await page.locator('.devlog-excerpt-code-line span[style]').count();
      const permalinks = await page.locator('.devlog-excerpt-permalink a').count();
      permalinkCount += permalinks;
      check(`${route} opens at least one excerpt`, opened > 0);
      check(`${route} renders line-number gutters`, gutters > 0);
      check(`${route} renders syntax-colored token spans`, coloredTokens > 0);
      await shot(route.replace(/^\//, '').replaceAll('/', '-'));
    }
    check(`${viewport} run exposes at least one pinned permalink`, permalinkCount > 0);
  },
};
