export default {
  name: 'feedback-dialog',
  route: '/',
  viewports: ['desktop', 'mobile'],
  async run({ page, viewport, check, shot }) {
    const trigger = page.getByRole('button', { name: 'Feedback' });
    check('Feedback trigger is present', (await trigger.count()) === 1);
    if (viewport === 'mobile') {
      const point = await trigger.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      });
      await page.touchscreen.tap(point.x, point.y);
    } else {
      await trigger.focus();
      await page.keyboard.press('Enter');
    }

    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check(`${viewport === 'mobile' ? 'tap' : 'Enter'} opens the dialog`, await dialog.isVisible());
    const textarea = page.getByRole('textbox', { name: 'Feedback' });
    const focused = await textarea.evaluate((element) => element === document.activeElement);
    check('Field label moves focus into the textarea', focused);
    const category = dialog.getByRole('combobox', { name: 'Category' });
    check('Category select is present', (await category.count()) === 1);
    check('Category defaults to Bug', ((await category.textContent()) ?? '').includes('Bug'));
    await category.click();
    const feature = page.getByRole('option', { name: 'Feature request' });
    await feature.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check('Category popup lists Feature request', await feature.isVisible());
    await feature.click();
    check(
      'Category trigger shows Feature request',
      ((await category.textContent()) ?? '').includes('Feature request'),
    );
    await textarea.fill('UI system probe');
    await shot('open');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    check('Escape closes the dialog', !(await dialog.isVisible().catch(() => false)));
  },
};
