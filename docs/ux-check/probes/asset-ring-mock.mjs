export default {
  name: 'asset-ring-mock',
  route: '/industry/23784',
  viewports: ['desktop'],
  settle: 2200,
  async setup({ page }) {
    await page.route('**/api/industry/owned-assets', async (route) => {
      let typeIds = [];
      try {
        typeIds = JSON.parse(route.request().postData() ?? '{}').typeIds ?? [];
      } catch {}
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
  async run({ page, check, shot }) {
    const rings = page.getByRole('button', { name: /asset tracking/i });
    const ringCount = await rings.count();
    check('mock ownership renders multiple asset rings', ringCount > 2);
    await shot('plan');
    if (ringCount === 0) return;

    const trigger = rings.first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('mock asset ledger opens', (await trigger.getAttribute('data-popup-open')) !== null);
    const bodyText = await page.evaluate(() => document.body.innerText);
    check('mock corporation holding is shown', bodyText.includes('Lo-Gang'));
    check('mock character holding is shown', bodyText.includes('Test Pilot'));
    await shot('ledger-open');
  },
};
