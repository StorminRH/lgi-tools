// SC-7.2 / SC-6.1 / SC-8.1: no-map Atlas renders the landing catalogue, and
// activating a card opens exactly that map's canvas. Requires auth.
export default {
  name: 'atlas-map-catalogue',
  route: '/atlas',
  viewports: ['desktop', 'mobile'],
  requiresAuth: true,
  settle: 1500,
  async run({ page, check }) {
    const catalogue = page.locator('[data-map-catalogue]');
    await catalogue.waitFor({ state: 'visible', timeout: 60_000 });
    check('no-map Atlas renders the catalogue, not an empty canvas', await catalogue.isVisible());
    check(
      'the canvas path stays unmounted on the landing',
      (await page.locator('[data-map-canvas]').count()) === 0,
    );
    check(
      'listing failure is not the landing',
      (await page.locator('[data-map-catalogue-unavailable]').count()) === 0,
    );
    check(
      'the landing uses the global site header',
      await page.locator('header.app-header').isVisible(),
    );
    const shell = page.locator('[data-page-shell]');
    check('the landing uses the shared page shell', await shell.isVisible());
    const shellText = (await shell.textContent()) ?? '';
    check('the landing paints lgi://atlas', /lgi:\/\/atlas/i.test(shellText));
    check(
      'the landing title is Atlas',
      ((await shell.locator('h1').textContent()) ?? '').trim() === 'Atlas',
    );
    check(
      'the landing does not lock document scroll',
      (await page.evaluate(() => getComputedStyle(document.body).overflow)) !==
        'hidden',
    );
    check(
      'map chrome stays off the landing',
      (await page.locator('[data-map-chrome]').count()) === 0,
    );
    check(
      'the create control is in the page header',
      await page.locator('[data-map-catalogue-create]').isVisible(),
    );
    check(
      'the trash entry is present',
      await page.locator('[data-map-catalogue-trash]').isVisible(),
    );

    const cards = page.locator('[data-map-catalogue-card]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      check(
        'zero maps show the create-card hint',
        await page.locator('[data-map-catalogue-empty-hint]').isVisible(),
      );
      return;
    }

    check(
      'at least one provenance section is labeled',
      (await page.locator('#map-catalogue-created, #map-catalogue-corporation, #map-catalogue-direct').count()) >
        0,
    );

    const editButtons = page.locator('[data-map-catalogue-edit]');
    if ((await editButtons.count()) > 0) {
      const adminMapId = await editButtons.first().getAttribute('data-map-catalogue-edit');
      check(
      'admin cards expose a delete action separate from edit access',
      typeof adminMapId === 'string' &&
        adminMapId.length > 0 &&
        (await page.locator(`[data-map-catalogue-delete="${adminMapId}"]`).isVisible()),
    );
    }

    const firstCard = cards.first();
    const mapId = await firstCard.getAttribute('data-map-catalogue-card');
    check('a catalogue card exposes its map id', typeof mapId === 'string' && mapId.length > 0);
    if (mapId === null || mapId.length === 0) return;

    await page.locator(`[data-map-catalogue-open="${mapId}"]`).click();
    await page.waitForURL((url) => url.searchParams.get('map') === mapId, {
      timeout: 15_000,
      waitUntil: 'domcontentloaded',
    });
    await page
      .locator(`[data-map-switcher-trigger][data-map-id="${mapId}"]`)
      .waitFor({ state: 'visible', timeout: 60_000 });
    check(
      'activating a card opens exactly that map canvas',
      (await page.locator('[data-map-canvas]').count()) > 0 &&
        (await page.locator('[data-map-catalogue]').count()) === 0,
    );
    check(
      'opening a map covers the site frame',
      await page.locator('[data-map-canvas-frame]').isVisible(),
    );
    check(
      'opening a map hides the global site header',
      (await page.locator('header.app-header').isVisible()) === false,
    );
    check(
      'opening a map shows map chrome',
      await page.locator('[data-map-chrome]').isVisible(),
    );
  },
};
