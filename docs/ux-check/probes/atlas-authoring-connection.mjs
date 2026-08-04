// SC-4 / SC-6.1: edge-anchored connection details card with field controls.
// Seeds a disposable jump when the map has no edges yet.
import {
  authoringMapId,
  authoringRoute,
  clickFirstEdge,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const FROM_SYSTEM_ID = 30_000_142; // Jita
const TO_SYSTEM_ID = 30_000_144; // Perimeter

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

    if ((await page.locator('.react-flow__edge').count()) === 0) {
      await convexRun('mapFixtures:placeJumpFixture', {
        mapId,
        fromSystemId: FROM_SYSTEM_ID,
        toSystemId: TO_SYSTEM_ID,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
      });
      await page.waitForFunction(
        () => document.querySelectorAll('.react-flow__edge').length >= 1,
        null,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(800);
    }

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
    check(
      'ship size select is present',
      (await page.getByRole('combobox', { name: 'Ship size' }).count()) === 1,
    );
    check(
      'stability select is present',
      (await page.getByRole('combobox', { name: 'Mass stability' }).count()) === 1,
    );
    check(
      'life stage select is present',
      (await page.getByRole('combobox', { name: 'Life stage' }).count()) === 1,
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
