export default {
  name: 'cost-basis',
  route: '/industry/12043',
  viewports: ['desktop'],
  settle: 3000,
  async run({ page, check, shot }) {
    const tile = page.locator('div.rounded-md.border', { hasText: 'Input cost' }).first();
    const figure = async () => {
      const text = await tile.innerText();
      return text.match(/[\d,]+(?:\.\d+)?[KMB]?\s*ISK|[\d,]+(?:\.\d+)?[KMB]/)?.[0] ?? '?';
    };

    const itemFigure = await figure();
    check('Item cost figure renders', itemFigure !== '?');
    await shot('item');
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await page.waitForTimeout(600);
    const rawFigure = await figure();
    check('Raw cost differs from Item cost', rawFigure !== '?' && rawFigure !== itemFigure);
    await shot('raw');

    const help = page.getByRole('button', { name: 'How input cost is computed' }).first();
    await help.hover();
    await page.waitForTimeout(600);
    const popoverText = await page
      .locator('[role="presentation"], [data-popup-open]')
      .last()
      .innerText()
      .catch(() => '');
    check('input-cost popover shows Raw and Item bases', popoverText.includes('Raw') && popoverText.includes('Item'));
    await shot('popover');

    await page.getByRole('button', { name: 'Item', exact: true }).click();
    await page.waitForTimeout(600);
    check('Item toggle restores a rendered figure', (await figure()) !== '?');
  },
};
