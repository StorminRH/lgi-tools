export default {
  name: 'templates-menu',
  route: '/industry/692',
  viewports: ['desktop'],
  settle: 1500,
  allowConsole: [/status of 401/i],
  async run({ page, baseUrl, check, shot }) {
    const trigger = page.getByRole('button', { name: 'Saved templates' }).first();
    check('saved-templates trigger is present', (await trigger.count()) === 1);
    await trigger.click();
    await page.waitForTimeout(400);
    check('panel opens on click', (await trigger.getAttribute('data-popup-open')) !== null);
    check(
      'signed-out empty state is shown',
      (await page.getByText('Sign in to save build templates').count()) === 1,
    );
    await shot('open');

    const nameInput = page.getByRole('textbox', { name: 'Template name' });
    await nameInput.fill('Probe template');
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    check('Save enables after a name is typed', await saveButton.isEnabled());
    await saveButton.click();
    const errorToast = page.locator('[data-sonner-toast]', {
      hasText: 'Sign in to save build templates',
    });
    await errorToast.waitFor({ timeout: 5000 }).catch(() => {});
    check('signed-out save surfaces the 401 toast', (await errorToast.count()) === 1);
    await shot('save-401');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes the panel', (await trigger.getAttribute('data-popup-open')) === null);

    await page.goto(new URL('/industry/692?plan=probe-does-not-exist', baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const notFoundToast = page.locator('[data-sonner-toast]', { hasText: 'Saved template not found' });
    await notFoundToast.waitFor({ timeout: 12000 }).catch(() => {});
    check('unknown plan id fires the not-found toast', (await notFoundToast.count()) === 1);
    await shot('loader-not-found');
    await page.waitForTimeout(300);
    check('plan param is stripped after handling', !new URL(page.url()).searchParams.has('plan'));
  },
};
