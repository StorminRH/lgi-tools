const PLACEHOLDER = 'Build system — type a name';

export default {
  name: 'combobox-terminal',
  route: '/industry/691',
  viewports: ['desktop', 'mobile'],
  settle: 4500,
  async run({ page, check, shot }) {
    const input = page.getByPlaceholder(PLACEHOLDER).first();
    const present = (await input.count()) > 0;
    check('unpicked build-system field is present', present);
    if (!present) return;

    await page.keyboard.press('Tab');
    for (let index = 0; index < 60; index += 1) {
      if (await input.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    const focused = await input.evaluate((element) => element === document.activeElement);
    check('keyboard Tab reaches the build-system input', focused);
    if (focused) {
      const ring = await input.evaluate((element) => ({
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: getComputedStyle(element).outlineStyle,
      }));
      check('keyboard focus uses the field-owned single ring', ring.focusVisible && ring.outlineStyle === 'none');
      await shot('focus-ring');
    }

    await input.fill('jita');
    await page.waitForTimeout(700);
    check('typeahead yields suggestions', (await page.getByRole('option').count()) > 0);
    await shot('open');
    await input.press('ArrowDown');
    await page.waitForTimeout(250);
    check('ArrowDown highlights a suggestion', (await page.locator('[role="option"][data-highlighted]').count()) > 0);
    await shot('highlighted');

    await input.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes the suggestions', (await page.getByRole('option').count()) === 0);
    check('Escape keeps the unpicked field', (await page.getByPlaceholder(PLACEHOLDER).count()) > 0);

    await input.fill('jita');
    await page.waitForTimeout(600);
    await input.press('ArrowDown');
    await page.waitForTimeout(200);
    await input.press('Enter');
    await page.waitForTimeout(900);
    check('Enter selects the highlighted system', (await page.getByPlaceholder(PLACEHOLDER).count()) === 0);
    await shot('after-select');
  },
};
