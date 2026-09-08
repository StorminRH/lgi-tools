import { expect } from '@playwright/test';

export default {
  name: 'sites-standalone-detail', route: '/sites/49', viewports: ['desktop', 'mobile'],
  async run({ page }) {
    const card = page.locator('[data-site-card][data-presentation="standalone"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Barren Perimeter Reservoir');
    await expect(page.getByRole('heading', { name: /related/i })).toBeVisible();
    const related = page.locator('a[href^="/sites/"]').filter({ hasText: /Reservoir/ }).first();
    const href = await related.getAttribute('href');
    if (href === null || href === '/sites/49') throw new Error('BLOCKED: related site fixture missing');
    await related.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator('[data-site-card][data-presentation="standalone"]')).toBeVisible();
  },
};
