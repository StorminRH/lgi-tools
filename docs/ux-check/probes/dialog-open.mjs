export default {
  name: 'dialog-open',
  get route() { return '/sites'; },
  viewports: ['desktop', 'mobile'],
  async setup({ page }) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('lgi:pref:sites.detailMode', '"lightbox"');
      } catch {}
    });
  },
  async run({ page, viewport, check }) {
    const summary = page.locator('[data-site-card] details > summary').first();
    const present = (await summary.count()) > 0;
    check('site card summary is present', present);

    await summary.scrollIntoViewIfNeeded();
    if (viewport === 'mobile') await summary.tap();
    else await summary.click();
    await page.waitForTimeout(450);
    const dialog = page.getByRole('dialog').first();
    const opened = (await dialog.count()) > 0 && (await dialog.isVisible());
    check(`${viewport === 'mobile' ? 'tap' : 'click'} opens the lightbox`, opened);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check('Escape closes the lightbox', (await page.getByRole('dialog').count()) === 0);
  },
};
