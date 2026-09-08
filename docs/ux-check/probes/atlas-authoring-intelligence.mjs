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
  get route() { return authoringRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  async run({ page, check }) {
    const mapId = authoringMapId();
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

    await waitForEditableMap(page);
    await ensureJumpEdge(page, mapId);
    await openFirstEdgeEditor(page);
    const card = signatureEditor(page);
    await card.waitFor({ state: 'attached', timeout: 15_000 });

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
    check('typed connection commits B274', await card.getByPlaceholder('Type code — e.g. B274 or K162').inputValue() === 'B274');
  },
};
