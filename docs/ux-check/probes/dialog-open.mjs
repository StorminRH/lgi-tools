export default {
  name: 'dialog-open',
  route: '/sites',
  viewports: ['desktop', 'mobile'],
  settle: 1500,
  async setup({ page }) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('lgi:pref:sites.detailMode', '"lightbox"');
      } catch {}
    });
  },
  async run({ page, viewport, check, shot }) {
    const summary = page.locator('[data-site-card] details > summary').first();
    const present = (await summary.count()) > 0;
    check('site card summary is present', present);
    if (!present) return;

    await summary.scrollIntoViewIfNeeded();
    if (viewport === 'mobile') await summary.tap();
    else await summary.click();
    await page.waitForTimeout(450);
    const dialog = page.getByRole('dialog').first();
    const opened = (await dialog.count()) > 0 && (await dialog.isVisible());
    check(`${viewport === 'mobile' ? 'tap' : 'click'} opens the lightbox`, opened);
    if (!opened) return;
    await shot('lightbox-open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check('Escape closes the lightbox', (await page.getByRole('dialog').count()) === 0);
  },
};
