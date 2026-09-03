export default {
  name: 'atlas-map-create',
  route: '/atlas',
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 1500,
  async run({ page, check }) {
    const catalogue = page.locator('[data-map-catalogue]');
    await catalogue.waitFor({ state: 'visible', timeout: 60_000 });

    await page.locator('[data-map-catalogue-create]').click();
    const dialog = page.getByRole('dialog', { name: 'Create map' });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    check('create control opens the creation dialog', await dialog.isVisible());
    check(
      'the creation editor is in create mode',
      (await page.locator('[data-map-access-editor="create"]').count()) === 1,
    );
    const removeGrant = dialog.getByRole('button', { name: 'Remove' });
    while ((await removeGrant.count()) > 0) {
      await removeGrant.first().click();
    }
    check(
      'empty access list starts private',
      (await dialog.getByText('Private — no delegated access.').count()) === 1,
    );

    const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const mapName = `UX create ${stamp}`;
    await dialog.getByLabel('Map name').fill(mapName);
    const startedAt = Date.now();
    await dialog.getByRole('button', { name: 'Create map' }).click();

    const interstitial = page.locator('[data-map-creation-interstitial="creating"]');
    await interstitial.waitFor({ state: 'visible', timeout: 10_000 });
    check('the compass interstitial is visible after submit', await interstitial.isVisible());
    check(
      'interstitial copy is Creating your map',
      (await page.getByRole('heading', { name: 'Creating your map' }).count()) === 1,
    );

    const home = page.locator('[data-map-home-prompt]');
    await home.waitFor({ state: 'visible', timeout: 30_000 });
    const elapsedMs = Date.now() - startedAt;
    const mapId = new URL(page.url()).searchParams.get('map');
    check('creation interstitial lasted at least five seconds', elapsedMs >= 5_000);
    check('successful creation lands on a selected map', typeof mapId === 'string' && mapId.length > 0);
    check('the new map opens at the set-home prompt', await home.isVisible());
    check(
      'home title asks to set the home system',
      (await page.getByRole('heading', { name: 'Set your home system' }).count()) === 1,
    );
  },
};
