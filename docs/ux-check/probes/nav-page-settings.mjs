async function openMenu(page) {
  const toggle = page.locator('[data-nav-menu-toggle]');
  await toggle.tap();
  await page.waitForTimeout(250);
  return {
    toggle,
    panel: page.locator('[data-nav-menu-panel]'),
  };
}

export default {
  name: 'nav-page-settings',
  route: '/sites',
  viewports: ['mobile'],
  settle: 1200,
  async run({ page, baseUrl, check, shot }) {
    let { toggle, panel } = await openMenu(page);
    const settings = panel.locator('[data-page-menu-section]');
    check('sites menu includes page settings', await settings.isVisible());
    check('page settings precede the login footer', await settings.evaluate(
      (element) => element.nextElementSibling?.matches('[data-nav-login-footer]') ?? false,
    ));

    const groups = settings.getByRole('group');
    check('sites menu exposes both segmented controls', (await groups.count()) === 2);
    const firstGroup = groups.first();
    const choices = firstGroup.getByRole('button');
    const selected = firstGroup.getByRole('button', { pressed: true });
    const selectedLabel = await selected.textContent();
    const alternate = choices.filter({ hasNotText: selectedLabel ?? '' }).first();
    await alternate.tap();
    await page.waitForTimeout(250);
    check('choosing a page setting keeps the menu open', await panel.isVisible());
    check('the chosen segment becomes selected', (await alternate.getAttribute('aria-pressed')) === 'true');
    await shot('sites-settings');

    await page.keyboard.press('Escape');
    await page.goto(new URL('/', baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(300);
    ({ toggle, panel } = await openMenu(page));
    check('routes without a spec omit page settings', (await panel.locator('[data-page-menu-section]').count()) === 0);
    const footer = panel.locator('[data-nav-login-footer]');
    check('login footer remains visible without page settings', await footer.isVisible());
    check(
      'no empty settings section sits before the footer',
      await footer.evaluate((element) => !element.previousElementSibling?.matches('[data-page-menu-section]')),
    );
    check('menu remains owned by the same trigger', await toggle.getAttribute('data-popup-open') !== null);
    await shot('home-no-settings');
  },
};
