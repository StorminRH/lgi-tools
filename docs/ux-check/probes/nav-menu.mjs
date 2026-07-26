export default {
  name: 'nav-menu',
  route: '/',
  viewports: ['mobile', 'tablet', 'desktop'],
  settle: 1200,
  async run({ page, viewport, check, shot }) {
    const expectedViewport = viewport === 'mobile'
      ? { width: 390, height: 844 }
      : viewport === 'tablet'
        ? { width: 768, height: 1024 }
        : { width: 1440, height: 900 };
    const configuredViewport = page.viewportSize();
    check(
      `browser context matches ${viewport} matrix dimensions`,
      configuredViewport?.width === expectedViewport.width
        && configuredViewport.height === expectedViewport.height,
    );
    const browserWindow = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    if (viewport === 'tablet') {
      check(
        'tablet window reports the declared non-desktop dimensions',
        browserWindow.width === expectedViewport.width
          && browserWindow.height === expectedViewport.height,
      );
    }

    const toggle = page.locator('[data-nav-menu-toggle]');
    if (viewport === 'desktop') {
      check('collapsed nav trigger is hidden', !(await toggle.isVisible()));
      const toolNav = page.locator('nav[aria-label="Tools"]');
      const statusSlot = page.locator('[data-server-status-slot]');
      const accountSlot = page.locator('[data-account-slot]');
      check('desktop tool navigation is visible', await toolNav.isVisible());
      check('desktop account slot is visible', await accountSlot.isVisible());

      const [navBox, statusBox, accountBox] = await Promise.all([
        toolNav.boundingBox(),
        statusSlot.boundingBox(),
        accountSlot.boundingBox(),
      ]);
      check(
        'tool navigation is right-aligned against the status and account cluster',
        navBox !== null
          && statusBox !== null
          && accountBox !== null
          && Math.abs(navBox.x + navBox.width - statusBox.x) <= 1
          && Math.abs(statusBox.x + statusBox.width - accountBox.x) <= 1,
      );

      const divider = await toolNav.locator('li').nth(0).evaluate((item) => {
        const style = getComputedStyle(item);
        return {
          width: style.borderInlineEndWidth,
          color: style.borderInlineEndColor,
        };
      });
      check(
        'desktop tool cells retain a visible divider',
        divider.width === '1px' && divider.color !== 'rgba(0, 0, 0, 0)',
      );
      await shot('desktop-aligned');
      return;
    }

    const isOpen = async () => (await toggle.getAttribute('data-popup-open')) !== null;
    check('collapsed nav trigger is visible', await toggle.isVisible());

    if (viewport === 'mobile') await toggle.tap();
    else await toggle.click();
    await page.waitForTimeout(350);
    check(`${viewport === 'mobile' ? 'tap' : 'click'} opens the menu`, await isOpen());
    const panel = page.locator('[data-nav-menu-panel]');
    check('menu panel is visible', await panel.isVisible());
    await shot('open');

    const sitesLink = panel.locator('a', { hasText: 'Wormhole Sites' });
    check('Wormhole Sites link is present', (await sitesLink.count()) > 0);
    if (viewport === 'mobile') await sitesLink.first().tap();
    else await sitesLink.first().click();
    await page.waitForURL('**/sites', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    check('link activation navigates to /sites', new URL(page.url()).pathname === '/sites');
    check('menu closes after navigation', !(await isOpen()));
    check('menu panel unmounts after navigation', (await page.locator('[data-nav-menu-panel]').count()) === 0);
    await shot('after-link-tap');

    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    check('Enter opens the menu', await isOpen());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes the menu', !(await isOpen()));
  },
};
