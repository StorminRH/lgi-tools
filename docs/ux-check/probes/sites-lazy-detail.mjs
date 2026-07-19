async function activate(locator, viewport) {
  if (viewport === 'mobile') await locator.tap();
  else await locator.click();
}

async function everyWrapperIsEmpty(wrappers) {
  return wrappers.evaluateAll((nodes) => nodes.every((node) => node.childElementCount === 0));
}

async function exactlyFirstWrapperMounted(wrappers) {
  const childCounts = await wrappers.evaluateAll((nodes) => nodes.map((node) => node.childElementCount));
  return childCounts[0] > 0 && childCounts.slice(1).every((count) => count === 0);
}

export default {
  name: 'sites-lazy-detail',
  route: '/sites',
  viewports: ['desktop', 'mobile'],
  settle: 1800,
  async setup({ page }) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('lgi:pref:sites.detailMode', '"expand"');
        localStorage.setItem('lgi:pref:sites.view', '"cards"');
      } catch {}
    });
  },
  async run({ page, viewport, check, shot }) {
    const cards = page.locator('[data-site-card]');
    const cardSummaries = page.locator('[data-site-card] details[data-collapsible] > summary');
    const cardWrappers = page.locator('[data-site-card] [data-lazy-details]');
    const cardCount = await cards.count();
    check(
      'card outer summary count equals card count',
      cardCount > 0
        && (await cardSummaries.count()) === cardCount
        && (await cardWrappers.count()) === cardCount,
    );
    check('all card lazy wrappers are empty before open', await everyWrapperIsEmpty(cardWrappers));

    if (cardCount > 0) {
      const firstCardSummary = cardSummaries.first();
      await firstCardSummary.scrollIntoViewIfNeeded();
      await activate(firstCardSummary, viewport);
      await page.waitForFunction(() => (
        document.querySelector('[data-site-card] [data-lazy-details]')?.childElementCount ?? 0
      ) > 0);
      check(
        'opening the first card mounts only its lazy wrapper',
        await exactlyFirstWrapperMounted(cardWrappers),
      );
      await shot('card-first-open');
    } else {
      check('opening the first card mounts only its lazy wrapper', false);
    }

    const viewControl = page.getByRole('group', { name: 'Sites view' });
    const tableButton = viewControl.getByRole('button', { name: 'Table' });
    if ((await tableButton.count()) === 0) {
      check('table outer summary count equals row count', false);
      check('all table lazy wrappers are empty before open', false);
      check('opening the first table row mounts only its lazy wrapper', false);
      return;
    }
    await activate(tableButton, viewport);
    const rows = page.locator('details.sites-table-row');
    await rows.first().waitFor({ state: 'visible' });
    const rowSummaries = page.locator('details.sites-table-row > summary');
    const tableWrappers = page.locator('details.sites-table-row [data-lazy-details]');
    const rowCount = await rows.count();
    check(
      'table outer summary count equals row count',
      rowCount > 0
        && (await rowSummaries.count()) === rowCount
        && (await tableWrappers.count()) === rowCount,
    );
    check('all table lazy wrappers are empty before open', await everyWrapperIsEmpty(tableWrappers));

    if (rowCount > 0) {
      const firstRowSummary = rowSummaries.first();
      await firstRowSummary.scrollIntoViewIfNeeded();
      await activate(firstRowSummary, viewport);
      await page.waitForFunction(() => (
        document.querySelector('details.sites-table-row [data-lazy-details]')?.childElementCount ?? 0
      ) > 0);
      check(
        'opening the first table row mounts only its lazy wrapper',
        await exactlyFirstWrapperMounted(tableWrappers),
      );
      await shot('table-first-open');
    } else {
      check('opening the first table row mounts only its lazy wrapper', false);
    }
  },
};
