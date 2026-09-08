import { expect } from '@playwright/test';

export default {
  name: 'eve-image-network', route: '/industry/11372', viewports: ['desktop'],
  async run({ page }) {
    const image = page.locator('img[src^="https://images.evetech.net/"]').first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    const source = await image.getAttribute('src');
    if (source === null) throw new Error('Expected EVE image source missing');
    const response = await page.request.get(source);
    expect(response.ok(), 'expected EVE image response succeeds').toBe(true);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  },
};
