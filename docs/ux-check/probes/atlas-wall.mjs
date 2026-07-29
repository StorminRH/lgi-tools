export default {
  name: 'atlas-wall',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  settle: 1200,
  async run({ page, viewport, check, shot }) {
    const wall = page.getByRole('heading', {
      name: /Map not yet cleared for public undock/i,
    });
    check('signed-out visitor sees the development wall', await wall.isVisible());
    check(
      'canvas marker is absent for non-admins',
      (await page.locator('[data-map-canvas]').count()) === 0,
    );
    check(
      'floating map chrome is absent for non-admins',
      (await page.locator('.map-chrome').count()) === 0,
    );

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const frame = document.querySelector('.h-\\[100dvh\\], [class*="h-[100dvh]"]');
      return {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        bodyOverflow: getComputedStyle(body).overflow,
        frameHeight: frame instanceof HTMLElement ? Math.round(frame.getBoundingClientRect().height) : 0,
        windowInnerHeight: window.innerHeight,
      };
    });
    check(
      'map frame fills the dynamic viewport height',
      metrics.frameHeight >= metrics.windowInnerHeight - 1,
    );
    check(
      'page itself does not gain a vertical scrollbar',
      metrics.scrollHeight <= metrics.clientHeight + 1,
    );

    await shot(`${viewport}-wall`);
  },
};
