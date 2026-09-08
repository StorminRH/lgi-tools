import { expect } from '@playwright/test';

export default {
  name: 'combobox-global', route: '/', viewports: ['desktop', 'mobile'],
  async run({ page, viewport }) {
    const input = page.locator('[data-search-input]').first();
    await expect(input).toBeVisible();
    if (viewport === 'mobile') await input.tap();
    else {
      await page.keyboard.press('Control+k');
      await expect(input).toBeFocused();
    }
    await input.fill('open changelog');
    const option = page.getByRole('option', { name: /Open changelog/i }).first();
    await expect(option).toBeVisible();
    if (viewport === 'mobile') await option.tap();
    else {
      await input.press('ArrowDown');
      await expect(page.locator('[role="option"][data-highlighted]')).toContainText('Open changelog');
      await input.press('Enter');
    }
    await expect(page).toHaveURL(/\/changelog$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Changelog');
    await page.goto('/');
    const restored = page.locator('[data-search-input]').first();
    await restored.fill('open changelog');
    await expect(page.getByRole('option').first()).toBeVisible();
    await restored.press('Escape');
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(restored).toHaveValue('');
    await expect(restored).toBeFocused();
  },
};
