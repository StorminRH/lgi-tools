export default {
  name: 'multibuy-panel',
  route: '/industry/23758',
  viewports: ['desktop'],
  settle: 2000,
  async setup({ page, baseUrl }) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseUrl).origin,
    });
  },
  async run({ page, check, shot }) {
    const trigger = page.getByRole('button', { name: 'Multibuy export' }).first();
    const present = (await trigger.count()) > 0;
    check('Multibuy export trigger is present', present);
    if (!present) return;
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.waitForTimeout(300);
    check('panel opens on click', (await trigger.getAttribute('data-popup-open')) !== null);

    const totalButton = page.getByRole('button', { name: 'Total', exact: true });
    const remainingButton = page.getByRole('button', { name: 'Remaining', exact: true });
    check('Total is active by default', (await totalButton.getAttribute('aria-pressed')) === 'true');
    check('Remaining is disabled while logged out', await remainingButton.isDisabled());

    const summaryText = async () => (await page.getByText(/\d+ items? · /).first().textContent()) ?? '';
    const before = await summaryText();
    const boxes = page.getByRole('checkbox', { name: /Build tier \d+/ });
    const boxCount = await boxes.count();
    check('multiple build-tier checkboxes are present', boxCount > 1);
    await shot('open');
    if (boxCount > 1) {
      await boxes.last().click();
      await page.waitForTimeout(200);
      check('tier selection updates the live item count', (await summaryText()) !== before);
      await boxes.last().click();
    }

    const help = page.getByRole('button', { name: 'What the multibuy export copies' }).first();
    check('nested explainer trigger is present', (await help.count()) > 0);
    if ((await help.count()) > 0) {
      await help.click();
      await page.waitForTimeout(300);
      check(
        'nested explainer opens',
        (await page.getByText(/Check the tiers you.ll build yourself/).count()) > 0,
      );
      await shot('explainer');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    const copyButton = page.getByRole('button', { name: 'Copy', exact: true });
    if ((await copyButton.count()) === 0 || !(await copyButton.isVisible())) {
      await trigger.click();
      await page.waitForTimeout(300);
    }
    await copyButton.click();
    await page.waitForTimeout(400);
    check('copy shows a confirmation toast', (await page.getByText(/Copied \d+ items? to clipboard/).count()) > 0);
    await shot('copied-toast');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const lines = clipboard.split('\n').filter(Boolean);
    check('clipboard contains Name<TAB>integer rows', lines.length > 0 && lines.every((line) => /^.+\t\d+$/.test(line)));
    check('clipboard quantities have no thousand separators', !clipboard.includes(','));
  },
};
