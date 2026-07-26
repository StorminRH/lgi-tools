async function openDrawer(page) {
  const trigger = page.locator('[data-content-drawer-trigger]');
  await trigger.tap();
  await page.waitForTimeout(200);
  return {
    trigger,
    popup: page.locator('[data-content-drawer-popup]'),
    backdrop: page.locator('[data-content-drawer-backdrop]'),
  };
}

export default {
  name: 'contents-drawer',
  route: '/devlog/vercel',
  viewports: ['mobile'],
  reducedMotion: true,
  async run({ page, baseUrl, check, shot }) {
    const chapterTitle = page.locator('[data-content-drawer-current-title]');
    check('chapter bar names the current devlog document', ((await chapterTitle.textContent()) ?? '').trim().length > 0);

    let { trigger, popup, backdrop } = await openDrawer(page);
    const dialog = page.getByRole('dialog', { name: 'Documents' });
    check('chapter bar opens the named documents dialog', await dialog.isVisible());
    check(
      'focus moves inside the drawer',
      await popup.evaluate((element) => element.contains(document.activeElement)),
    );
    const durations = await Promise.all([
      popup.evaluate((element) => getComputedStyle(element).transitionDuration),
      backdrop.evaluate((element) => getComputedStyle(element).transitionDuration),
    ]);
    check('reduced motion removes popup transition time', durations[0].split(',').every((value) => value.trim() === '0s'));
    check('reduced motion removes backdrop transition time', durations[1].split(',').every((value) => value.trim() === '0s'));
    await shot('devlog-open');

    const currentHref = await popup.locator('[aria-current="page"]').getAttribute('href');
    const destination = popup.locator(
      '[data-content-browser-nav-item]:not([aria-current="page"])',
    ).first();
    const destinationHref = await destination.getAttribute('href');
    check('drawer offers another document', destinationHref !== null && destinationHref !== currentHref);
    await destination.tap();
    if (destinationHref) await page.waitForURL(`**${destinationHref}`, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    check('document navigation closes the drawer', !(await popup.isVisible()));
    check(
      'focus returns to the chapter bar after navigation',
      await trigger.evaluate((element) => element === document.activeElement),
    );

    ({ trigger, popup } = await openDrawer(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes the documents drawer', !(await popup.isVisible()));
    check('Escape restores focus to the chapter bar', await trigger.evaluate((element) => element === document.activeElement));

    await page.goto(new URL('/changelog/v3.8', baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(300);
    check(
      'version chapter bar names v3.8',
      /^v3\.8\b/.test(((await page.locator('[data-content-drawer-current-title]').textContent()) ?? '').trim()),
    );
    ({ popup } = await openDrawer(page));
    check('version chapter bar opens the named versions dialog', await page.getByRole('dialog', { name: 'Versions' }).isVisible());
    check('v3.8 remains active inside the drawer', /^v3\.8\b/.test((await popup.locator('[aria-current="page"]').textContent()) ?? ''));
    await shot('versions-open');
  },
};
