export default {
  name: 'asset-ledger',
  route: '/industry/23784',
  viewports: ['desktop', 'mobile'],
  settle: 1800,
  async run({ page, viewport, check, shot }) {
    const trigger = page.getByRole('button', { name: /asset tracking/i }).first();
    const present = (await trigger.count()) > 0;
    check('asset-tracking trigger is present', present);
    if (!present) return;
    await trigger.scrollIntoViewIfNeeded();
    if (viewport === 'mobile') await trigger.tap();
    else {
      await trigger.focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(450);
    check('asset ledger opens', (await trigger.getAttribute('data-popup-open')) !== null);
    const bodyText = await page.evaluate(() => document.body.innerText);
    check('logged-out holdings placeholder is present', bodyText.includes('No holdings tracked yet'));
    check(
      'ledger totals are present',
      ['Total Needed', 'Total Owned', 'Total Remaining'].every((label) => bodyText.includes(label)),
    );
    await shot('open');
    if (viewport === 'desktop') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      check('Escape closes the ledger', (await trigger.getAttribute('data-popup-open')) === null);
    }
  },
};
