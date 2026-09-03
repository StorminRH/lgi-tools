import {
  authoringMapId,
  authoringRoute,
  ensureJumpEdge,
  openFirstEdgeEditor,
  signatureEditor,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-authoring-connection',
  route: authoringRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, shot }) {
    const mapId = authoringMapId();
    if (!mapId) {
      check('UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);
    await ensureJumpEdge(page, mapId);
    await openFirstEdgeEditor(page);
    const card = signatureEditor(page);
    check('edge right-click Edit opens the Signature Editor', await card.isVisible());
    check(
      'exactly one editor exists on the map',
      (await card.count()) === 1,
    );
    check(
      'the retired edge-click card is gone',
      (await page.locator('[data-map-connection-details]').count()) === 0,
    );
    check(
      'field form is present',
      (await page.locator('[data-map-connection-fields]').count()) === 1,
    );
    check(
      'wormhole type search is present',
      (await page.getByPlaceholder('Type code — e.g. B274 or K162').count()) === 1,
    );
    const shipSizeSelect = await page.getByRole('combobox', { name: 'Size' }).count();
    const sizeLocked = await page.locator('[data-map-connection-size-locked]').count();
    check(
      'size is an editable select or a locked codex readout',
      shipSizeSelect === 1 || sizeLocked === 1,
    );
    check(
      'mass select is present',
      (await page.getByRole('combobox', { name: 'Mass' }).count()) === 1,
    );
    check(
      'reliable lifetime select is present',
      (await page.getByRole('combobox', { name: 'Reliable Lifetime' }).count()) === 1,
    );
    check(
      'delete control is present on the editable panel',
      (await page.locator('[data-map-connection-delete]').count()) === 1,
    );
    check(
      'the retired typed-side and far-side controls are gone',
      (await page.getByRole('combobox', { name: 'Typed side' }).count()) === 0
        && (await page.getByRole('combobox', { name: 'Far side leads to' }).count()) === 0,
    );

    const stability = page.getByRole('combobox', { name: 'Mass' });
    const stabilityText = (await stability.textContent()) ?? '';
    const looksUnset = /unset/i.test(stabilityText) || stabilityText.trim() === '';
    const looksObserved = /remaining/i.test(stabilityText);
    check(
      'mass select shows unset or an observed in-game mass report',
      looksUnset || looksObserved,
    );

    await shot('signature-editor');
  },
};
