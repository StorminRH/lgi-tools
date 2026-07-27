export default {
  name: 'toast-stack',
  route: '/industry/692?plan=probe-stack',
  viewports: ['desktop', 'mobile'],
  settle: 1400,
  async setup({ page }) {
    await page.route('**/api/account/saved-plans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plans: [
            {
              id: 'probe-stack',
              name: 'Stack probe',
              favorite: false,
              blueprintTypeId: 692,
              productTypeId: 1944,
              productName: 'Bestower',
              snapshot: { v: 1, blueprintTypeId: 692 },
              updatedAt: '2026-07-26T00:00:00.000Z',
            },
          ],
        }),
      });
    });
    await page.route('**/api/market-prices/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prices: [] }),
      });
    });
  },
  async run({ page, check, shot }) {
    const templateToast = page.locator('[data-sonner-toast]', { hasText: 'Loaded "Stack probe"' });
    const syncToast = page.locator('[data-sonner-toast]', { hasText: '> syncing…' });
    await templateToast.waitFor({ timeout: 12000 }).catch(() => {});
    await syncToast.waitFor({ timeout: 12000 }).catch(() => {});

    check('template-loaded toast is visible', await templateToast.isVisible().catch(() => false));
    check('keyed sync toast is visible', await syncToast.isVisible().catch(() => false));

    const boxes = await Promise.all([templateToast.boundingBox(), syncToast.boundingBox()]);
    const [first, second] = boxes;
    const separated =
      first !== null &&
      second !== null &&
      (first.y + first.height <= second.y || second.y + second.height <= first.y);
    check('concurrent toast cards do not overlap', separated);
    check(
      'both toast messages remain readable',
      (await templateToast.textContent())?.includes('Stack probe') === true &&
        (await syncToast.textContent())?.includes('syncing') === true,
    );
    await shot('concurrent');
  },
};
