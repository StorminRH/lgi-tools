// SC-1 / SC-3 / SC-6.1: typed codex panel, size lock, mass range, lifetime row.
import {
  authoringMapId,
  authoringRoute,
  clickFirstEdge,
  ensureJumpEdge,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-authoring-intelligence',
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
    const card = page.locator('[data-map-window="connection-details"]');
    await card.waitFor({ state: 'attached', timeout: 15_000 });

    // Give the session wormhole codex a chance to resolve a pre-typed edge
    // before deciding to type. Prior probe runs may already have set B274.
    await Promise.race([
      card.locator('[data-map-connection-codex]').waitFor({
        state: 'attached',
        timeout: 8_000,
      }),
      page.waitForTimeout(8_000),
    ]).catch(() => undefined);

    if ((await card.locator('[data-map-connection-codex]').count()) === 0) {
      const typeInput = page.getByPlaceholder('Type code — e.g. B274 or K162');
      await typeInput.click();
      // Codex codes load async — wait for the B274 suggestion before submit so
      // an empty list cannot fail closed with "No wormhole type matches…"
      await typeInput.fill('B');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[role="option"]')].some((el) =>
            (el.textContent ?? '').trim().startsWith('B'),
          ),
        null,
        { timeout: 20_000 },
      );
      await typeInput.fill('B274');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[role="option"]')].some(
            (el) => (el.textContent ?? '').trim() === 'B274',
          ),
        null,
        { timeout: 10_000 },
      );
      await typeInput.press('ArrowDown');
      await page.waitForTimeout(150);
      await typeInput.press('Enter');
      await card.locator('[data-map-connection-codex]').waitFor({
        state: 'attached',
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
    }
    check(
      'codex panel mounts for typed hole',
      (await card.locator('[data-map-connection-codex]').count()) === 1,
    );
    check(
      'ship size is a locked readout',
      (await card.locator('[data-map-connection-size-locked]').count()) === 1,
    );
    check(
      'typed hole has no editable ship-size select',
      (await card.getByRole('combobox', { name: 'Ship size' }).count()) === 0,
    );
    check(
      'mass range readout is present',
      (await card.locator('[data-map-connection-mass-range]').count()) === 1,
    );
    check(
      'lifetime ceiling or range is present',
      (await card.locator('[data-map-connection-lifetime]').count()) === 1,
    );
    check(
      'sever control is present',
      (await card.locator('[data-map-connection-sever]').count()) === 1,
    );

    await shot('connection-intelligence');
  },
};
