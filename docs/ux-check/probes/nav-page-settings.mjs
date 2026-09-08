import { expect } from '@playwright/test';

export default {
  name: 'nav-page-settings', route: '/sites', viewports: ['mobile'],
  async run({ page }) {
    const toggle = page.locator('[data-nav-menu-toggle]');
    await toggle.tap();
    const panel = page.locator('[data-nav-menu-panel]');
    const settings = panel.locator('[data-page-menu-section]');
    await expect(settings).toBeVisible();
    const table = settings.getByRole('group', { name: 'Sites view' }).getByRole('button', { name: 'Table' });
    await table.tap();
    await expect(table).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('details[data-sites-row]').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('details[data-sites-row]').first()).toBeVisible();
    await toggle.tap();
    await expect(table).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.goto('/');
    await toggle.tap();
    await expect(panel.locator('[data-page-menu-section]')).toHaveCount(0);
    await expect(panel.locator('[data-nav-login-footer]')).toBeVisible();
    await page.keyboard.press('Escape');
  },
};
