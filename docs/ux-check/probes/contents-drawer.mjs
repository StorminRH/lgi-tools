async function openDrawer(page) {
  const trigger = page.locator('[data-drawer-trigger]');
  await trigger.tap();
  await page.waitForTimeout(200);
  return {
    trigger,
    popup: page.locator('[data-drawer-popup]'),
    backdrop: page.locator('[data-drawer-backdrop]'),
  };
}

export default {
  name: 'contents-drawer',
  route: '/changelog/v3.8',
  viewports: ['mobile'],
  reducedMotion: true,
  async run({ page, check, shot }) {
    const chapterTitle = page.locator('[data-content-drawer-current-title]');
    check(
      'chapter bar names the current changelog document',
      /^v3\.8\b/.test(((await chapterTitle.textContent()) ?? '').trim()),
    );

    let { trigger, popup, backdrop } = await openDrawer(page);
    const dialog = page.getByRole('dialog', { name: 'Versions' });
    check('chapter bar opens the named versions dialog', await dialog.isVisible());
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
    await shot('versions-open');

    const currentHref = await popup.locator('[aria-current="page"]').getAttribute('href');
    const destination = popup.locator(
      '[data-content-browser-nav-item]:not([aria-current="page"])',
    ).first();
    const destinationHref = await destination.getAttribute('href');
    check('drawer offers another document', destinationHref !== null && destinationHref !== currentHref);
    await destination.focus();
    check(
      'keyboard focus reaches a non-current document',
      await destination.evaluate((element) => element === document.activeElement),
    );
    await page.keyboard.press('Enter');
    if (destinationHref) await page.waitForURL(`**${destinationHref}`, { timeout: 15000 });
    await page.waitForTimeout(300);
    check('document navigation closes the drawer', !(await popup.isVisible()));
    check(
      'focus returns to the chapter bar after navigation',
      await trigger.evaluate((element) => element === document.activeElement),
    );

    ({ trigger, popup } = await openDrawer(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes the versions drawer', !(await popup.isVisible()));
    check('Escape restores focus to the chapter bar', await trigger.evaluate((element) => element === document.activeElement));
  },
};
