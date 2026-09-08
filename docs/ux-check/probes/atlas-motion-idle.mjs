import { expect } from '@playwright/test';
import { atlasWindowRoute, waitForWindowMap } from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-motion-idle', get route() { return atlasWindowRoute(); },
  viewports: ['desktop'], requiresAuth: true,
  async run({ page }) {
    await waitForWindowMap(page);
    const disc = page.locator('.map-node-disc').first();
    await disc.hover();
    await expect.poll(() => disc.evaluate(element => getComputedStyle(element).animationName)).toContain('map-node-breathe');
    await page.mouse.move(4, 4);
    await expect.poll(() => disc.evaluate(element => getComputedStyle(element).animationName)).not.toContain('map-node-breathe');
  },
};
