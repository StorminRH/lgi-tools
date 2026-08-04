// SC-1 / SC-2 / SC-4 / SC-6: two-client live authoring demo —
// home → add → edit → fan-out → revocation. Mutates the blank map under test;
// re-projects access after the revocation step so the map stays usable.
import {
  authoringMapId,
  authoringRoute,
  calmMapCamera,
  clickFirstEdge,
  openAddConnectionMenu,
  pickSystemSearch,
  restoreMapAccess,
  teardownMapAccess,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

async function pickSelect(page, ariaLabel, optionName) {
  // Edge-anchored cards can sit outside the CSS viewport during camera settle;
  // open/choose via DOM events scoped to the connection card.
  await page.waitForFunction(
    (label) =>
      document.querySelector(
        `[data-map-window="connection-details"] [aria-label="${label}"]`,
      ) instanceof HTMLElement,
    ariaLabel,
    { timeout: 10_000 },
  );
  await page.evaluate((label) => {
    const control = document.querySelector(
      `[data-map-window="connection-details"] [aria-label="${label}"]`,
    );
    if (!(control instanceof HTMLElement)) throw new Error(`missing select ${label}`);
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    control.click();
  }, ariaLabel);
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[role="option"]')].some(
        (el) => (el.textContent ?? '').trim() === name,
      ),
    optionName,
    { timeout: 5_000 },
  );
  await page.evaluate((name) => {
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (el) => (el.textContent ?? '').trim() === name,
    );
    if (!(option instanceof HTMLElement)) throw new Error(`missing option ${name}`);
    option.click();
  }, optionName);
  await page.waitForTimeout(500);
}

export default {
  name: 'atlas-authoring-two-clients',
  route: authoringRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2500,
  async run({ page, check, shot, createContext, baseUrl }) {
    const mapId = authoringMapId();
    if (!mapId) {
      check('UX_BLANK_MAP_ID or UX_MAP_ID is set for the blank map', false);
      return;
    }

    await waitForEditableMap(page);
    const home = page.locator('[data-map-home-prompt]');
    const startedBlank = (await home.count()) > 0;
    check('editor client starts on a blank map with the home prompt', startedBlank);
    if (!startedBlank) return;

    const second = await createContext();
    await second.page.goto(new URL(`/atlas?map=${mapId}`, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForEditableMap(second.page);
    check(
      'second authenticated client also sees the home prompt on the blank map',
      (await second.page.locator('[data-map-home-prompt]').count()) === 1,
    );
    await shot('two-clients-blank-home');
    await shot('two-clients-blank-home-b', { page: second.page });

    // Home pick on client A → fan-out to client B.
    await pickSystemSearch(page, 'Search systems — type a name', 'jita', {
      root: page.locator('[data-map-home-prompt]'),
    });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 30_000 },
    );
    await second.page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 30_000 },
    );
    check(
      'home pick fans out: both clients show one root node',
      (await page.locator('[data-chain-node]').count()) === 1
        && (await second.page.locator('[data-chain-node]').count()) === 1,
    );
    check(
      'home prompt unmounts after the root exists',
      (await page.locator('[data-map-home-prompt]').count()) === 0,
    );
    await shot('two-clients-after-home');

    // Add-from-node on client A → whole reveal on client B.
    await openAddConnectionMenu(page);
    await page.getByRole('menuitem', { name: 'Add connection…' }).click();
    await page.locator('[data-map-node-add-search]').waitFor({ state: 'visible', timeout: 10_000 });
    await pickSystemSearch(page, 'Destination system — type a name', 'amarr', {
      root: page.locator('[data-map-node-add-search]'),
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-chain-node]').length >= 2
        && document.querySelectorAll('.react-flow__edge').length >= 1,
      null,
      { timeout: 30_000 },
    );
    await second.page.waitForFunction(
      () =>
        document.querySelectorAll('[data-chain-node]').length >= 2
        && document.querySelectorAll('.react-flow__edge').length >= 1,
      null,
      { timeout: 30_000 },
    );
    check(
      'add-from-node fans out: both clients show two nodes and one edge',
      (await page.locator('[data-chain-node]').count()) >= 2
        && (await second.page.locator('[data-chain-node]').count()) >= 2
        && (await page.locator('.react-flow__edge').count()) >= 1
        && (await second.page.locator('.react-flow__edge').count()) >= 1,
    );
    await shot('two-clients-after-add');

    // Edit connection fields on client A → live on client B.
    await calmMapCamera(page);
    await calmMapCamera(second.page);
    // Let birth/camera settle so the edge midpoint (and card) are stable.
    await page.waitForTimeout(1600);
    await clickFirstEdge(page);
    await pickSelect(page, 'Ship size', 'L');
    await pickSelect(page, 'Mass stability', 'Stable');
    await pickSelect(page, 'Life stage', 'Less than 1 day');
    await page.waitForTimeout(800);

    // Second client opens the same edge and observes the written values.
    await clickFirstEdge(second.page);
    const sizeB = (await second.page.getByRole('combobox', { name: 'Ship size' }).textContent()) ?? '';
    const massB =
      (await second.page.getByRole('combobox', { name: 'Mass stability' }).textContent()) ?? '';
    const lifeB =
      (await second.page.getByRole('combobox', { name: 'Life stage' }).textContent()) ?? '';
    check('ship size fans out to the second client', /\bL\b/.test(sizeB));
    check('stability fans out to the second client', /stable/i.test(massB));
    check('life stage fans out to the second client', /1 day/i.test(lifeB));
    await shot('two-clients-after-edit');
    await shot('two-clients-after-edit-b', { page: second.page });

    // Revocation: tear down claims → affordances / access poof on both clients.
    await teardownMapAccess(mapId);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-chain-no-access]') !== null
        || document.querySelector('[data-map-can-edit="true"]') === null,
      null,
      { timeout: 30_000 },
    );
    await second.page.waitForFunction(
      () =>
        document.querySelector('[data-chain-no-access]') !== null
        || document.querySelector('[data-map-can-edit="true"]') === null,
      null,
      { timeout: 30_000 },
    );
    check(
      'revocation removes editor affordances on client A',
      (await page.locator('[data-map-can-edit="true"]').count()) === 0
        || (await page.locator('[data-chain-no-access]').count()) === 1,
    );
    check(
      'revocation removes editor affordances on client B',
      (await second.page.locator('[data-map-can-edit="true"]').count()) === 0
        || (await second.page.locator('[data-chain-no-access]').count()) === 1,
    );
    check(
      'connection details card is gone after revocation',
      (await page.locator('[data-map-connection-details]').count()) === 0,
    );
    await shot('two-clients-after-revoke');

    // Restore access so later probes / operator review can reopen the map.
    await restoreMapAccess(mapId);
    await page.waitForTimeout(500);
  },
};
