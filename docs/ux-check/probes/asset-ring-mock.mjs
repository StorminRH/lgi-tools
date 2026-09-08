import { expect } from '@playwright/test';
export default {
  name: 'asset-ring-mock',
  get route() { return '/industry/23784'; },
  viewports: ['desktop', 'mobile'],
  async setup({ page }) {
    await page.route('**/api/industry/owned-assets', async (route) => {
      const body = route.request().postDataJSON();
      if (!Array.isArray(body?.typeIds)) {
        throw new Error('asset-ring-mock expected an owned-assets typeIds array');
      }
      const typeIds = body.typeIds;
      const assets = typeIds.map((typeId, index) => {
        const ownedQty = index % 3 === 0 ? 10_000_000_000 : index % 3 === 1 ? 4000 : 120;
        return {
          typeId,
          ownedQty,
          heldBy: [
            {
              ownerType: 'corporation',
              ownerName: 'Lo-Gang',
              locationName: 'Upwell structure',
              locationFlag: 'Corp Hangar 4',
              quantity: Math.ceil(ownedQty * 0.7),
            },
            {
              ownerType: 'character',
              ownerName: 'Test Pilot',
              locationName: 'In a ship',
              locationFlag: '',
              quantity: Math.floor(ownedQty * 0.3),
            },
          ],
        };
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assets }),
      });
    });
  },
  async run({ page, check, createContext, baseUrl, viewport }) {
    const rings = page.getByRole('button', { name: /asset tracking/i });
    const ringCount = await rings.count();
    check('mock ownership renders multiple asset rings', ringCount > 2);


    const trigger = rings.first();
    await trigger.scrollIntoViewIfNeeded();
    if (viewport === 'mobile') await trigger.tap();
    else { await trigger.focus(); await trigger.press('Enter'); }
    await page.waitForTimeout(400);
    check('mock asset ledger opens', (await trigger.getAttribute('data-popup-open')) !== null);
    const bodyText = await page.evaluate(() => document.body.innerText);
    check('mock corporation holding is shown', bodyText.includes('Lo-Gang'));
    check('mock character holding is shown', bodyText.includes('Test Pilot'));

    await page.keyboard.press('Escape');
    await expect(trigger).not.toHaveAttribute('data-popup-open');
    const guest = await createContext({ storageState: { cookies: [], origins: [] } });
    await guest.page.goto(new URL('/industry/23784', baseUrl).href);
    const emptyTrigger = guest.page.getByRole('button', { name: /asset tracking/i }).first();
    if (viewport === 'mobile') await emptyTrigger.tap();
    else { await emptyTrigger.focus(); await emptyTrigger.press('Enter'); }
    await expect(guest.page.getByText('No holdings tracked yet')).toBeVisible();
    for (const label of ['Total Needed', 'Total Owned', 'Total Remaining']) {
      await expect(guest.page.getByText(label, { exact: true })).toBeVisible();
    }
    await guest.page.keyboard.press('Escape');
    await expect(emptyTrigger).not.toHaveAttribute('data-popup-open');
  },
};
