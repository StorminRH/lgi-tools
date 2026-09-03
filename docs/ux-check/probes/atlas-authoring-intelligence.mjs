import {
  authoringMapId,
  authoringRoute,
  ensureJumpEdge,
  openFirstEdgeEditor,
  signatureEditor,
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
      check('UX_MAP_ID is set', false);
      return;
    }

    await waitForEditableMap(page);
    await ensureJumpEdge(page, mapId);
    await openFirstEdgeEditor(page);
    const card = signatureEditor(page);
    await card.waitFor({ state: 'attached', timeout: 15_000 });

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
      'size is a locked readout',
      (await card.locator('[data-map-connection-size-locked]').count()) === 1,
    );
    check(
      'typed hole has no editable size select',
      (await card.getByRole('combobox', { name: 'Size' }).count()) === 0,
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
      'delete control is present',
      (await card.locator('[data-map-connection-delete]').count()) === 1,
    );
    check(
      'the stats block carries no Codex heading',
      !/>Codex</.test(await card.innerHTML()),
    );

    await shot('connection-intelligence');
  },
};
