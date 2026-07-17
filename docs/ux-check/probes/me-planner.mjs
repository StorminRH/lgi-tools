const MAIN_BLUEPRINT = 29987;

export default {
  name: 'me-planner',
  route: '/industry/29987',
  viewports: ['desktop'],
  settle: 4000,
  allowConsole: [/status of 404/i],
  async setup({ page }) {
    await page.route('**/api/industry/owned-blueprints', async (route) => {
      const body = route.request().postDataJSON();
      const ids = body?.blueprintTypeIds ?? [];
      const efficiencies = [5, 8, 10, 7];
      const blueprints = ids
        .filter((_, index) => index % 2 === 0)
        .map((blueprintTypeId, index) => ({
          blueprintTypeId,
          me: blueprintTypeId === MAIN_BLUEPRINT ? 10 : efficiencies[index % efficiencies.length],
          te: 20,
          ownerType: 'character',
          ownerName: 'Test Pilot',
          locationName: 'Jita IV-4',
          locationFlag: 'Hangar',
        }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ blueprints }),
      });
    });
  },
  async run({ page, check, shot }) {
    const main = page.getByRole('textbox', { name: 'main blueprint material efficiency' }).first();
    check('main-blueprint ME control renders', (await main.count()) === 1);
    if ((await main.count()) === 0) return;
    check('mocked owned ME populates the main control', (await main.inputValue()) === '10');

    const componentAdjusters = page.getByRole('button', { name: /— efficiency$/i });
    check('component efficiency triggers render', (await componentAdjusters.count()) > 0);
    if ((await componentAdjusters.count()) > 0) {
      const trigger = componentAdjusters.first();
      await trigger.click();
      await page.waitForTimeout(300);
      check('component efficiency popover opens', (await trigger.getAttribute('data-popup-open')) !== null);
      check(
        'popover exposes blueprint research adjusters',
        (await page.getByText('Blueprint Research Adjusters', { exact: true }).count()) === 1,
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    const quantities = async () =>
      page.locator('[role="img"][aria-label]').evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('aria-label') ?? '')
          .filter((label) => /\b(?:needed|owned)\b/i.test(label))
          .join('|'),
      );
    const before = await quantities();
    await main.fill('0');
    await main.press('Tab');
    await page.waitForTimeout(700);
    const after = await quantities();
    check('ME override recomputes material quantities', before.length > 0 && before !== after);
    await shot('planner-orbs');
  },
};
