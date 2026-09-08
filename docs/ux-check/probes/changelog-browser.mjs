import { expect } from '@playwright/test';

export default {
  name: 'changelog-browser', route: '/changelog/v3.8', viewports: ['desktop'],
  async run({ page }) {
    const rail = page.locator('[data-content-browser-rail]');
    await expect(rail.locator('[aria-current="page"]')).toContainText('v3.8');
    await rail.locator('a[href="/changelog/v3.9"]').click();
    await expect(page).toHaveURL(/\/changelog\/v3\.9$/);
    await expect(rail.locator('[aria-current="page"]')).toContainText('v3.9');
    await expect(page.locator('[data-changelog-master-version]:visible')).toHaveText('v3.9');
    await expect(page).toHaveTitle(/v3\.9.*Changelog/i);
    await page.setViewportSize({ width: 1100, height: 300 });
    const body = page.locator('[data-content-browser-rail-body]');
    await body.scrollIntoViewIfNeeded();
    await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    await body.evaluate(element => { element.scrollTop = 0; });
    await body.hover();
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.mouse.wheel(0, 180);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  },
};
