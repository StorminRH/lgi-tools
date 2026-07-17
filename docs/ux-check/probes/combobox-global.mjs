const QUERY = 'combat';

async function focusByTab(page, input, attempts) {
  await page.keyboard.press('Tab');
  for (let index = 0; index < attempts; index += 1) {
    if (await input.evaluate((element) => element === document.activeElement)) return true;
    await page.keyboard.press('Tab');
  }
  return input.evaluate((element) => element === document.activeElement);
}

export default {
  name: 'combobox-global',
  route: '/',
  viewports: ['desktop', 'mobile'],
  settle: 2000,
  async run({ page, viewport, baseUrl, check, shot }) {
    const input = page.locator('[data-search-input]').first();
    const present = (await input.count()) > 0;
    check('global search input is present', present);
    if (!present) return;
    if (viewport === 'mobile') return;

    const focusedByTab = await focusByTab(page, input, 40);
    check('keyboard Tab reaches the search input', focusedByTab);
    if (focusedByTab) {
      const ring = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return { focusVisible: element.matches(':focus-visible'), outlineStyle: style.outlineStyle };
      });
      check('keyboard focus uses the field-owned single ring', ring.focusVisible && ring.outlineStyle === 'none');
      await shot('focus-ring');
    }
    await input.evaluate((element) => element.blur());
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    check('Control+K focuses the input', await input.evaluate((element) => element === document.activeElement));
    await input.fill(QUERY);
    await page.waitForTimeout(700);
    check('typing yields search options', (await page.getByRole('option').count()) > 0);
    await shot('open');

    await input.press('ArrowDown');
    await page.waitForTimeout(200);
    check('ArrowDown highlights an option', (await page.locator('[role="option"][data-highlighted]').count()) > 0);
    await shot('highlighted');

    const before = page.url();
    await input.press('Enter');
    await page.waitForTimeout(900);
    check('Enter navigates to the highlighted result', page.url() !== before);

    await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const restored = page.locator('[data-search-input]').first();
    await page.keyboard.press('Control+k');
    await restored.fill(QUERY);
    await page.waitForTimeout(500);
    await restored.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes the results', (await page.getByRole('option').count()) === 0);
    check('Escape clears the query', (await restored.inputValue()) === '');
  },
};
