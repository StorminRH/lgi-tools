import { expect } from '@playwright/test';
import { atlasWindowRoute, mapWindow, waitForWindowMap } from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-signature-chrome', get route() { return atlasWindowRoute(); },
  viewports: ['desktop'], requiresAuth: true,
  async run({ page }) {
    await waitForWindowMap(page);
    await expect(mapWindow(page, 'signatures')).toBeVisible();
    const feedback = page.locator('[data-map-feedback-chip]');
    await feedback.focus();
    await feedback.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(feedback).toBeFocused();
  },
};
