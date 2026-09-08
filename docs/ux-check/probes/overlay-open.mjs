import { expect } from '@playwright/test';

export default {
  name: 'overlay-open', route: '/industry/691', viewports: ['desktop', 'mobile'],
  async run({ page, viewport }) {
    const trigger = page.getByRole('button', { name: 'How build time is estimated' }).first();
    await trigger.scrollIntoViewIfNeeded();
    if (viewport === 'mobile') await trigger.tap();
    else { await trigger.focus(); await trigger.press('Enter'); }
    await expect(trigger).toHaveAttribute('data-popup-open');
    await page.keyboard.press('Escape');
    await expect(trigger).not.toHaveAttribute('data-popup-open');
    await expect(trigger).toBeFocused();
  },
};
