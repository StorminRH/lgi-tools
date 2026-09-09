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
  atlasHomePrompt,
  atlasMain,
} from '../lib/authoring-helpers.mjs';

async function pickSelect(page, ariaLabel, optionName) {
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
  get route() { return blankMapRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  async run({ page, check, createContext, baseUrl }) {
    const mapId = blankMapId();
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

    await waitForEditableMap(page);
    const home = atlasHomePrompt(page);
    const startedBlank = (await home.count()) > 0;
    check(
      'editor client starts on a blank map with the home prompt (re-seed or drain UX_BLANK_MAP_ID after each run)',
      startedBlank,
    );

    const second = await createContext({ role: 'editor' });
    await second.page.goto(new URL(`/atlas?map=${mapId}`, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForEditableMap(second.page);
    check(
      'second authenticated client also sees the home prompt on the blank map',
      (await atlasHomePrompt(second.page).count()) === 1,
    );



    await pickSystemSearch(page, 'Search systems — type a name', 'jita', {
      root: atlasHomePrompt(page),
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
      (await atlasHomePrompt(page).count()) === 0,
    );


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
      (await page.locator('[data-chain-node]').count()) === 2
        && (await second.page.locator('[data-chain-node]').count()) === 2
        && (await page.locator('.react-flow__edge').count()) === 1
        && (await second.page.locator('.react-flow__edge').count()) === 1,
    );


    await calmMapCamera(page);
    await calmMapCamera(second.page);
    await page.waitForTimeout(1600);
    await openFirstEdgeEditor(page);
    await pickSelect(page, 'Size', 'L');
    await pickSelect(page, 'Mass', 'More than 50% remaining');
    await pickSelect(page, 'Reliable Lifetime', 'Less than 1 day remaining');
    await page.waitForTimeout(800);

    await openFirstEdgeEditor(second.page);
    const sizeB = (await second.page.getByRole('combobox', { name: 'Size' }).textContent()) ?? '';
    const massB =
      (await second.page.getByRole('combobox', { name: 'Mass' }).textContent()) ?? '';
    const lifeB =
      (await second.page.getByRole('combobox', { name: 'Reliable Lifetime' }).textContent()) ?? '';
    check('size fans out to the second client', /\bL\b/.test(sizeB));
    check('mass fans out to the second client', /more than 50%/i.test(massB));
    check('reliable lifetime fans out to the second client', /1 day/i.test(lifeB));



    try {
      await teardownMapAccess(mapId);
      await second.page.waitForFunction(
        () => {
          const visible = (selector) => [...document.querySelectorAll(selector)].some(
            (element) => element.checkVisibility?.() !== false && element.getClientRects().length > 0,
          );
          return visible('[data-chain-no-access]') || !visible('[data-map-can-edit="true"]');
        },
        null,
        { timeout: 30_000 },
      );
      check('owner retains editing after editor grant revocation',
        await atlasMain(page).locator('[data-map-can-edit="true"]').count() === 1);
      check(
        'revocation removes editor affordances on client B',
        (await atlasMain(second.page).locator('[data-map-can-edit="true"]').count()) === 0
          || (await atlasMain(second.page).locator('[data-chain-no-access]').count()) === 1,
      );
      check(
        'the Signature Editor is gone after revocation',
        (await second.page.locator('[data-map-window="signature-editor"]').count()) === 0,
      );

    } finally {
      await restoreMapAccess(mapId);
    }
    await page.waitForTimeout(500);
  },
};
