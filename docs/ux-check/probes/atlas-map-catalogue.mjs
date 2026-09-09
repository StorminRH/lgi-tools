import { expect } from '@playwright/test';
import { atlasMain, atlasVisible, authoringMapId } from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-map-catalogue', route: '/atlas', viewports: ['desktop', 'mobile'], requiresAuth: true,
  async run({ page, createContext, baseUrl }) {
    const empty = await createContext({ role: 'unauthorized' });
    await empty.page.goto(new URL('/atlas', baseUrl).href);
    const emptyMain = atlasMain(empty.page);
    const main = atlasMain(page);
    await expect(emptyMain.locator('[data-map-catalogue-empty-hint]')).toBeVisible();
    await expect(atlasVisible(empty.page, '[data-map-catalogue-card]')).toHaveCount(0);
    await expect(atlasVisible(empty.page, '[data-map-canvas]')).toHaveCount(0);
    await expect(main.locator('[data-map-catalogue]')).toBeVisible();
    await expect(atlasVisible(page, '[data-map-canvas]')).toHaveCount(0);
    const mapId = authoringMapId();
    if (!mapId) throw new Error('BLOCKED: populated catalogue fixture missing');
    await expect(main.locator(`[data-map-catalogue-delete="${mapId}"]`)).toBeVisible();
    await main.locator(`[data-map-catalogue-open="${mapId}"]`).click();
    await expect(page).toHaveURL(new URL(`/atlas?map=${mapId}`, baseUrl).href);
    await expect(main.locator(`[data-map-switcher-trigger][data-map-id="${mapId}"]`)).toBeVisible();
    await expect(atlasVisible(page, '[data-map-canvas]')).toBeVisible();
    await expect(atlasVisible(page, '[data-map-catalogue]')).toHaveCount(0);
  },
};
