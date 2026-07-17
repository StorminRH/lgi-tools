const LABELS = [
  'How the Market Score is calculated',
  'How build time is estimated',
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default {
  name: 'overlay-open',
  route: '/industry/691',
  viewports: ['desktop', 'mobile'],
  settle: 1500,
  async run({ page, viewport, check, shot }) {
    let opened = 0;
    for (const label of LABELS) {
      const trigger = page.getByRole('button', { name: label }).first();
      const present = (await trigger.count()) > 0;
      check(`trigger present: ${label}`, present);
      if (!present) continue;

      await trigger.scrollIntoViewIfNeeded();
      if (viewport === 'mobile') await trigger.tap();
      else await trigger.hover();
      await page.waitForTimeout(650);
      const openedByPointer = (await trigger.getAttribute('data-popup-open')) !== null;
      console.log(
        `    ${openedByPointer ? '✓' : '–'} ${viewport === 'mobile' ? 'tap' : 'hover'} opens: ${label}`,
      );
      if (openedByPointer) {
        opened += 1;
        await shot(slugify(label));
        if (viewport === 'mobile') {
          await page.touchscreen.tap(5, 5);
          await page.waitForTimeout(300);
        }
      }

      if (viewport === 'desktop') {
        await page.mouse.move(5, 5);
        await page.waitForTimeout(300);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(350);
        check(
          `Enter opens: ${label}`,
          (await trigger.getAttribute('data-popup-open')) !== null,
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        check(
          `Escape closes: ${label}`,
          (await trigger.getAttribute('data-popup-open')) === null,
        );
      }
    }
    check(`at least one overlay opened on ${viewport}`, opened > 0);
  },
};
