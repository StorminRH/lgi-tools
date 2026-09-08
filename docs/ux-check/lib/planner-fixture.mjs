export async function installPlannerPrices(page) {
  await page.route('**/api/market-prices/refresh', async route => {
    const { typeIds } = route.request().postDataJSON();
    if (!Array.isArray(typeIds)) throw new Error('Price request must supply typeIds');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      prices: typeIds.map(typeId => ({ typeId, bestBuy: 10, bestSell: 10, pct5Buy: 10, pct5Sell: 10,
        buyVolume: '100000000', sellVolume: '100000000', buyDepth: [], sellDepth: [],
        updatedAt: new Date().toISOString(), staleAfter: new Date(Date.now() + 3600000).toISOString(), source: 'esi' })),
    }) });
  });
}

export async function installMemoryClipboard(page) {
  await page.addInitScript(() => {
    window.__acceptanceClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.__acceptanceClipboard = text; },
      readText: async () => window.__acceptanceClipboard,
    } });
  });
}
