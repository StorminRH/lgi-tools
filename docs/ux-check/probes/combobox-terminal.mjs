import { expect } from '@playwright/test';

export default {
  name: 'combobox-terminal', route: '/industry/691', viewports: ['desktop', 'mobile'],
  async run({ page, viewport }) {
    const input = page.getByPlaceholder('Build system — type a name').first();
    await expect(input).toBeVisible();
    await input.fill('jita');
    const option = page.getByRole('option', { name: /^Jita\b/i }).first();
    await expect(option).toBeVisible();
    await input.press('Escape');
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(input).toBeVisible();
    await input.fill('jita');
    await expect(option).toBeVisible();
    if (viewport === 'mobile') await option.tap();
    else {
      await input.press('ArrowDown');
      await expect(page.locator('[role="option"][data-highlighted]')).toContainText('Jita');
      await input.press('Enter');
    }
    await expect(input).toHaveCount(0);
    await expect(page.getByText('Jita 0.9', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Build location' })).toContainText('NPC station');
    await page.reload();
    await expect(page.getByText('Jita 0.9', { exact: true })).toBeVisible();
  },
};
