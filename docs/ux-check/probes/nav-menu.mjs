export default {
  name: 'nav-menu',
  route: '/',
  viewports: ['mobile'],
  settle: 1200,
  async run({ page, check, shot }) {
    const toggle = page.locator('button.nav-menu-toggle');
    const isOpen = async () => (await toggle.getAttribute('data-popup-open')) !== null;
    check('mobile nav trigger is visible', await toggle.isVisible());

    await toggle.tap();
    await page.waitForTimeout(350);
    check('tap opens the menu', await isOpen());
    check('menu panel is visible', await page.locator('.nav-menu-panel').isVisible());
    await shot('open');

    const sitesLink = page.locator('.nav-menu-panel a.nav-tool', { hasText: 'Wormhole Sites' });
    check('Wormhole Sites link is present', (await sitesLink.count()) > 0);
    await sitesLink.first().tap();
    await page.waitForURL('**/sites', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    check('link tap navigates to /sites', new URL(page.url()).pathname === '/sites');
    check('menu closes after navigation', !(await isOpen()));
    check('menu panel unmounts after navigation', (await page.locator('.nav-menu-panel').count()) === 0);
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
