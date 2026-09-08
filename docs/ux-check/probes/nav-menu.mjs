import { expect } from '@playwright/test';

export default {
  name: 'nav-menu', route: '/', viewports: ['desktop', 'mobile'],
  async run({ page, viewport }) {
    const toggle = page.locator('[data-nav-menu-toggle]');
    if (viewport === 'desktop') {
      await expect(toggle).toBeHidden();
      await page.locator('nav[aria-label="Tools"] a[href="/sites"]').click();
    } else {
      await toggle.tap();
      const panel = page.locator('[data-nav-menu-panel]');
      await expect(panel).toBeVisible();
      await panel.locator('a[href="/sites"]').tap();
      await expect(panel).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/sites$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wormhole Sites');
    await expect(page.locator('[data-site-card]').first()).toBeVisible();
    if (viewport === 'mobile') {
      await toggle.focus();
      await toggle.press('Enter');
      await expect(page.locator('[data-nav-menu-panel]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-nav-menu-panel]')).toHaveCount(0);
      await expect(toggle).toBeFocused();
    }
  },
};
