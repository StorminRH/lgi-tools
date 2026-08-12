// SC-4 / SC-8.1: delete from the landing card hides the map, trash restore
// returns it with no prompt. Mutates: one disposable map per run.
export default {
  name: 'atlas-map-lifecycle',
  route: '/atlas',
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 1500,
  async run({ page, check }) {
    const catalogue = page.locator('[data-map-catalogue]');
    await catalogue.waitFor({ state: 'visible', timeout: 60_000 });

    await page.locator('[data-map-catalogue-create]').click();
    const createDialog = page.getByRole('dialog', { name: 'Create map' });
    await createDialog.waitFor({ state: 'visible', timeout: 10_000 });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const mapName = `UX lifecycle ${stamp}`;
    await createDialog.getByLabel('Map name').fill(mapName);
    const removeGrant = createDialog.getByRole('button', { name: 'Remove' });
    while ((await removeGrant.count()) > 0) {
      await removeGrant.first().click();
    }
    await createDialog.getByRole('button', { name: 'Create map' }).click();
    await page.locator('[data-map-home-prompt]').waitFor({ state: 'visible', timeout: 30_000 });
    const mapId = new URL(page.url()).searchParams.get('map');
    check('lifecycle probe created a disposable map', typeof mapId === 'string' && mapId.length > 0);
    if (mapId === null || mapId.length === 0) return;

    await page.goto(new URL('/atlas', page.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await catalogue.waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator(`[data-map-catalogue-delete="${mapId}"]`).click();
    const confirm = page.getByRole('dialog', { name: 'Delete map?' });
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    await confirm.getByRole('button', { name: 'Delete map' }).click();

    await page.locator(`[data-map-catalogue-card="${mapId}"]`).waitFor({
      state: 'hidden',
      timeout: 20_000,
    });
    check(
      'delete returns the deleter to the landing catalogue',
      await catalogue.isVisible() && (await page.locator('[data-map-canvas]').count()) === 0,
    );
    check(
      'the deleted map leaves the catalogue',
      (await page.locator(`[data-map-catalogue-card="${mapId}"]`).count()) === 0,
    );

    await page.locator('[data-map-catalogue-trash]').click();
    const trash = page.getByRole('dialog', { name: 'Deleted maps' });
    await trash.waitFor({ state: 'visible', timeout: 10_000 });
    check('trash lists the deleted map', await trash.getByText(mapName, { exact: true }).isVisible());
    await trash.locator('label').filter({ hasText: mapName }).click();
    await trash.getByRole('button', { name: 'Restore' }).click();
    await page.locator(`[data-map-catalogue-card="${mapId}"]`).waitFor({
      state: 'visible',
      timeout: 20_000,
    });
    check(
      'restore returns the map to the catalogue without a confirm prompt',
      await page.locator(`[data-map-catalogue-card="${mapId}"]`).isVisible(),
    );
  },
};
