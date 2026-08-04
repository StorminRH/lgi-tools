// SC-4 / SC-6.1: edge-anchored connection details card with field controls.
// Seeds a disposable jump when the map has no edges yet.
import {
  authoringMapId,
  authoringRoute,
  clickFirstEdge,
  ensureJumpEdge,
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
      check('UX_BLANK_MAP_ID or UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);
    await ensureJumpEdge(page, mapId);
    await clickFirstEdge(page);
    const card = page.locator('[data-map-connection-details]');
    check('connection details card mounts on edge click', await card.isVisible());
    check(
      'card uses the MapWindow connection-details id',
      (await page.locator('[data-map-window="connection-details"]').count()) === 1,
    );
    check(
      'field form is present',
      (await page.locator('[data-map-connection-fields]').count()) === 1,
    );
    check(
      'wormhole type search is present',
      (await page.getByPlaceholder('Type code — e.g. B274 or K162').count()) === 1,
    );
    const shipSizeSelect = await page.getByRole('combobox', { name: 'Ship size' }).count();
    const sizeLocked = await page.locator('[data-map-connection-size-locked]').count();
    check(
      'ship size is an editable select or a locked codex readout',
      shipSizeSelect === 1 || sizeLocked === 1,
    );
    check(
      'stability select is present',
      (await page.getByRole('combobox', { name: 'Mass stability' }).count()) === 1,
    );
    check(
      'life stage select is present',
      (await page.getByRole('combobox', { name: 'Life stage' }).count()) === 1,
    );
    check(
      'sever control is present on the editable card',
      (await page.locator('[data-map-connection-sever]').count()) === 1,
    );

    // Fresh fixture jumps land with null massState ("Unset"); a map reused
    // after the two-client demo may already carry an observed value.
    const stability = page.getByRole('combobox', { name: 'Mass stability' });
    const stabilityText = (await stability.textContent()) ?? '';
    const looksUnset = /unset/i.test(stabilityText) || stabilityText.trim() === '';
    const looksObserved = /stable|reduced|critical/i.test(stabilityText);
    check(
      'stability select shows unset or an observed mass state',
      looksUnset || looksObserved,
    );

    await shot('connection-details');
  },
};
