const route = () =>
  process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas';

export default {
  name: 'atlas-map-access',
  route: route(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 1500,
  async run({ page, check }) {
    const mapId = process.env.UX_MAP_ID;
    if (!mapId) {
      check('UX_MAP_ID identifies an admin-authorized map', false);
      return;
    }

    const trigger = page.locator('[data-map-switcher-trigger]');
    await trigger.waitFor({ state: 'visible', timeout: 60_000 });
    await trigger.click();
    const cog = page.locator(`[data-map-switcher-manage="${mapId}"]`);
    await cog.waitFor({ state: 'visible', timeout: 10_000 });
    await cog.click();

    const dialog = page.getByRole('dialog', { name: /^Manage / });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    check('the switcher cog opens the access editor', await dialog.isVisible());
    check(
      'the shared editor is in manage mode',
      (await page.locator('[data-map-access-editor="manage"]').count()) === 1,
    );
    check(
      'character search is present',
      (await page.locator('[data-map-character-search]').count()) === 1,
    );
    check(
      'the creator is not a revocable grant row',
      (await page.locator('[data-map-access-principal^="character:9000001"]').count()) === 0,
    );
    check(
      'delete lives on the landing card, not the manage footer',
      (await dialog.getByRole('button', { name: 'Delete map' }).count()) === 0,
    );

    const grant = page.locator('[data-map-access-principal]').first();
    if ((await grant.count()) === 0) {
      check('private maps show an empty delegated list', await dialog.getByText('Private — no delegated access.').isVisible());
      return;
    }

    await grant.getByRole('button', { name: 'Revoke' }).click();
    const confirm = page.getByRole('dialog', { name: 'Revoke map access?' });
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    check('revoke asks for one confirmation', await confirm.isVisible());
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await confirm.waitFor({ state: 'hidden', timeout: 10_000 });
    check('cancel leaves the grant in place', (await grant.count()) === 1);
  },
};
