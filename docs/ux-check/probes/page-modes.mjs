const ROUTES = [
  { path: '/', mode: 'detail' },
  { path: '/contact', mode: 'reading' },
  { path: '/sites', mode: 'workspace' },
];

async function shellMetrics(page) {
  return page.locator('[data-page-shell]').evaluate((shell) => {
    const content = shell.querySelector('[data-page-shell-content]');
    if (!(content instanceof HTMLElement)) throw new Error('page shell content not found');
    const shellStyle = getComputedStyle(shell);
    const contentStyle = getComputedStyle(content);
    const viewportWidth = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - viewportWidth;
    const overflowSources = [...document.body.querySelectorAll('*')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(/\s+/).slice(0, 2).join('.')}` : ''}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1)
      .slice(0, 3);
    return {
      mode: shell.dataset.pageShellMode,
      maxWidth: shellStyle.maxWidth,
      paddingLeft: shellStyle.paddingLeft,
      paddingRight: shellStyle.paddingRight,
      paddingBottom: shellStyle.paddingBottom,
      contentMaxWidth: contentStyle.maxWidth,
      overflow,
      overflowSources,
    };
  });
}

export default {
  name: 'page-modes',
  route: '/',
  viewports: ['mobile', 'tablet', 'laptop', 'hd', 'desktop', 'wide', 'zoom200'],
  async run({ page, viewport, baseUrl, check, shot }) {
    const metrics = [];
    for (const route of ROUTES) {
      await page.goto(new URL(route.path, baseUrl).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(250);
      const current = await shellMetrics(page);
      metrics.push(current);
      check(`${route.mode} route declares its page mode`, current.mode === route.mode);
      if (viewport === 'mobile') {
        check(
          current.overflow <= 0
            ? `${route.mode} route has no horizontal overflow`
            : `${route.mode} route overflow is ${current.overflow}px via ${JSON.stringify(current.overflowSources)}`,
          current.overflow <= 0,
        );
      }
    }

    const [detail, reading, workspace] = metrics;
    check(
      'all modes share one outer frame',
      detail.maxWidth === reading.maxWidth
        && reading.maxWidth === workspace.maxWidth
        && detail.paddingLeft === reading.paddingLeft
        && reading.paddingLeft === workspace.paddingLeft
        && detail.paddingRight === reading.paddingRight
        && reading.paddingRight === workspace.paddingRight,
    );
    check('reading content uses the 760px measure', reading.contentMaxWidth === '760px');
    check(
      'all modes retain the 48px region footer',
      metrics.every((item) => item.paddingBottom === '48px'),
    );
    await shot(`${viewport}-workspace`);
  },
};
