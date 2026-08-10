// SC-1 / SC-2 / SC-4 / SC-6: two-client live authoring demo —
// home → add → edit → fan-out → revocation. Mutates the blank map under test;
// re-projects access after the revocation step so the map stays usable.
import {
  blankMapId,
  blankMapRoute,
  calmMapCamera,
  openFirstEdgeEditor,
  openAddConnectionMenu,
  pickSystemSearch,
  restoreMapAccess,
  teardownMapAccess,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

async function pickSelect(page, ariaLabel, optionName) {
  // Open/choose via DOM events scoped to the Signature Editor pop-out.
  await page.waitForFunction(
    (label) =>
      document.querySelector(
        `[data-map-window="signature-editor"] [aria-label="${label}"]`,
      ) instanceof HTMLElement,
    ariaLabel,
    { timeout: 10_000 },
  );
  await page.evaluate((label) => {
    const control = document.querySelector(
      `[data-map-window="signature-editor"] [aria-label="${label}"]`,
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
  route: blankMapRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2500,
  async run({ page, check, shot, createContext, baseUrl }) {
    const mapId = blankMapId();
    if (!mapId) {
      check('UX_BLANK_MAP_ID is set for the blank map', false);
      return;
    }

    await waitForEditableMap(page);
    const home = page.locator('[data-map-home-prompt]');
    const startedBlank = (await home.count()) > 0;
    // This probe authors a root + connection on the blank map, and no map
    // drain API exists yet — a rerun fails closed here until the operator
    // re-seeds or drains the UX_BLANK_MAP_ID map.
    check(
      'editor client starts on a blank map with the home prompt (re-seed or drain UX_BLANK_MAP_ID after each run)',
      startedBlank,
    );
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
    await openFirstEdgeEditor(page);
    await pickSelect(page, 'Size', 'L');
    await pickSelect(page, 'Mass', 'More than 50% remaining');
    await pickSelect(page, 'Reliable Lifetime', 'Less than 1 day remaining');
    await page.waitForTimeout(800);

    // Second client opens the same edge and observes the written values.
    await openFirstEdgeEditor(second.page);
    const sizeB = (await second.page.getByRole('combobox', { name: 'Size' }).textContent()) ?? '';
    const massB =
      (await second.page.getByRole('combobox', { name: 'Mass' }).textContent()) ?? '';
    const lifeB =
      (await second.page.getByRole('combobox', { name: 'Reliable Lifetime' }).textContent()) ?? '';
    check('size fans out to the second client', /\bL\b/.test(sizeB));
    check('mass fans out to the second client', /more than 50%/i.test(massB));
    check('reliable lifetime fans out to the second client', /1 day/i.test(lifeB));
    await shot('two-clients-after-edit');
    await shot('two-clients-after-edit-b', { page: second.page });

    // Revocation: tear down claims → affordances / access poof on both clients.
    // The restore runs in `finally` so a failed wait, check, or screenshot can
    // never leave the map revoked for later probes or operator review.
    try {
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
        'the Signature Editor is gone after revocation',
        (await page.locator('[data-map-window="signature-editor"]').count()) === 0,
      );
      await shot('two-clients-after-revoke');
    } finally {
      // Restore access so later probes / operator review can reopen the map.
      await restoreMapAccess(mapId);
    }
    await page.waitForTimeout(500);
  },
};
