import {
  calmMapCamera,
  convexRun,
  signatureLifecycleMapId,
  signatureLifecycleRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  doorbellAfter,
  sessionUserId,
  waitForTopology,
} from '../lib/doorbell-helpers.mjs';
import { mapWindow } from '../lib/window-helpers.mjs';

const CHARACTER_ID = 9_000_001;
const ORIGIN_SYSTEM_ID = 31_001_677;
const DESTINATION_SYSTEM_ID = 31_000_880;
const SHIP_TYPE_ID = 28_606;

const ROW = {
  cba: 'CBA-120\tCosmic Signature\tWormhole\t\t28.4%\t6.98 AU',
  lxx: 'LXX-844\tCosmic Signature\tWormhole\t\t58.6%\t9.87 AU',
  ihj: 'IHJ-610\tCosmic Signature\tGas Site\tBarren Perimeter Reservoir\t100.0%\t7.69 AU',
  tfz: 'TFZ-437\tCosmic Anomaly\tOre Site\tOrdinary Perimeter Deposit\t100.0%\t4.80 AU',
  ear: 'EAR-696\tCosmic Signature\t\t\t0.0%\t4.22 AU',
};

const FULL_SCAN = [ROW.cba, ROW.lxx, ROW.ihj, ROW.tfz, ROW.ear].join('\n');
const SCAN_WITHOUT_EAR = [ROW.cba, ROW.lxx, ROW.ihj, ROW.tfz].join('\n');
const SCAN_WITHOUT_LXX = [ROW.cba, ROW.ihj, ROW.tfz, ROW.ear].join('\n');

async function pasteScan(page, text) {
  await page.evaluate((payload) => {
    const data = new DataTransfer();
    data.setData('text/plain', payload);
    document.body.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

const signatureRow = (page, signatureId) =>
  page.locator(`[data-signature-row][data-signature-id="${signatureId}"]`);

async function waitForSignatureRows(page, expected) {
  await page.waitForFunction(
    (count) => document.querySelectorAll('[data-signature-row]').length === count,
    expected,
    { timeout: 30_000 },
  );
}

async function waitForSignatureText(page, signatureId, expected) {
  await page.waitForFunction(
    ({ id, text }) => {
      const row = document.querySelector(
        `[data-signature-row][data-signature-id="${id}"]`,
      );
      if (row === null) return false;
      if (row.textContent?.includes(text) === true) return true;
      return [...row.querySelectorAll('input')].some((input) =>
        input.value.includes(text),
      );
    },
    { id: signatureId, text: expected },
    { timeout: 30_000 },
  );
}

async function signatureRowShows(page, signatureId, expected) {
  return page.evaluate(
    ({ id, text }) => {
      const row = document.querySelector(
        `[data-signature-row][data-signature-id="${id}"]`,
      );
      if (row === null) return false;
      if (row.textContent?.includes(text) === true) return true;
      return [...row.querySelectorAll('input')].some((input) =>
        input.value.includes(text),
      );
    },
    { id: signatureId, text: expected },
  );
}

async function stubCount(page) {
  return await page.locator('[data-chain-node-stub]').count();
}

async function hasStubReadout(stub, name, classification) {
  return (await stub.locator('[data-chain-node-name]').textContent()) === name
    && (await stub.locator('[data-chain-node-classification]').textContent())
      === classification;
}

export default {
  name: 'atlas-signature-lifecycle',
  route: signatureLifecycleRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, createContext, baseUrl }) {
    const mapId = signatureLifecycleMapId();
    if (!mapId) {
      check('UX_SIG_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    const userId = await sessionUserId(page, baseUrl);
    if (userId === null) {
      check('authenticated storage state exposes a session user id', false);
      return;
    }

    await waitForEditableMap(page);
    const second = await createContext();
    await second.page.goto(new URL(`/atlas?map=${mapId}`, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForEditableMap(second.page);
    await calmMapCamera(page);

    const seededTransitionAt = Date.now();
    await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: seededTransitionAt,
      });
    });

    const restampFreshness = () =>
      convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: seededTransitionAt,
        feedFreshAt: Date.now(),
      });
    await Promise.all([
      waitForTopology(page, 3, 2),
      waitForTopology(second.page, 3, 2),
    ]);
    const initialStaticStubs = page.locator('[data-chain-node-static-stub]');
    check(
      'identified J-space draws both guaranteed statics before any scan',
      (await initialStaticStubs.count()) === 2
      && await hasStubReadout(initialStaticStubs.nth(0), 'C247', 'C3')
      && await hasStubReadout(initialStaticStubs.nth(1), 'N766', 'C2'),
    );

    await restampFreshness();
    await pasteScan(page, FULL_SCAN);
    await Promise.all([
      waitForSignatureRows(page, 5),
      waitForSignatureRows(second.page, 5),
      waitForTopology(page, 3, 2),
      waitForTopology(second.page, 3, 2),
    ]);
    check(
      'paste fans out signature rows to both clients',
      (await signatureRow(page, 'CBA-120').count()) === 1
      && (await signatureRow(second.page, 'CBA-120').count()) === 1
      && (await signatureRow(page, 'EAR-696').count()) === 1
      && (await signatureRow(second.page, 'EAR-696').count()) === 1,
    );
    check(
      'scanner groups render as cards',
      (await page.locator('[data-scanner-section="wormholes"]').count()) === 1
      && (await page.locator('[data-scanner-section="harvestables"]').count()) === 1
      && (await page.locator('[data-scanner-section="unknown"]').count()) === 1,
    );
    check(
      'unidentified wormhole rows reuse exactly two believed-hole ghosts',
      (await stubCount(page)) === 2 && (await stubCount(second.page)) === 2,
    );
    check(
      'stub nodes are derived, interaction-inert presentation',
      (await page
        .locator('[data-chain-node-stub][data-chain-node-derived]')
        .count()) === 2,
    );

    await restampFreshness();
    await pasteScan(page, FULL_SCAN);
    await page.waitForTimeout(1_500);
    check(
      'unchanged re-paste leaves rows, stubs, and edges untouched',
      (await page.locator('[data-signature-row]').count()) === 5
      && (await stubCount(page)) === 2
      && (await page.locator('.react-flow__edge').count()) === 2,
    );

    await restampFreshness();
    await pasteScan(page, SCAN_WITHOUT_EAR);
    const earRow = signatureRow(page, 'EAR-696');
    await earRow
      .locator('xpath=self::*[@data-signature-missing]')
      .waitFor({ state: 'attached', timeout: 15_000 });
    check(
      'missing highlight is local to the pasting client',
      (await second.page
        .locator('[data-signature-id="EAR-696"][data-signature-missing]')
        .count()) === 0,
    );
    const missingPrompt = () => page.locator('[data-signature-missing-prompt]');
    await missingPrompt().getByRole('button', { name: 'Dismiss' }).click();
    await page.waitForTimeout(400);
    check(
      'dismiss keeps the row and clears the highlight',
      (await earRow.count()) === 1
      && (await page
        .locator('[data-signature-id="EAR-696"][data-signature-missing]')
        .count()) === 0
      && (await missingPrompt().count()) === 0,
    );

    await restampFreshness();
    await pasteScan(page, SCAN_WITHOUT_EAR);
    await earRow
      .locator('xpath=self::*[@data-signature-missing]')
      .waitFor({ state: 'attached', timeout: 15_000 });
    await missingPrompt().waitFor({ state: 'visible', timeout: 10_000 });
    await missingPrompt().getByRole('button', { name: 'Remove' }).click();
    await Promise.all([
      page
        .locator('[data-signature-id="EAR-696"]')
        .waitFor({ state: 'detached', timeout: 15_000 }),
      second.page
        .locator('[data-signature-id="EAR-696"]')
        .waitFor({ state: 'detached', timeout: 15_000 }),
    ]);
    check('prompt Remove leaves both clients', true);
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.waitFor({ state: 'visible', timeout: 5_000 });
    await undo.click();
    await Promise.all([
      signatureRow(page, 'EAR-696').waitFor({ state: 'attached', timeout: 15_000 }),
      signatureRow(second.page, 'EAR-696').waitFor({
        state: 'attached',
        timeout: 15_000,
      }),
    ]);
    check('undo restores the row on both clients', true);

    const typeInput = signatureRow(page, 'CBA-120').getByLabel('Type');
    await typeInput.waitFor({ state: 'visible', timeout: 10_000 });
    await typeInput.fill('C247');
    await page.waitForTimeout(600);
    const eliminationToast = page.locator('[data-sonner-toast]', {
      hasText: 'LXX-844 has been identified.',
    });
    const eliminationAppeared = eliminationToast.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await typeInput.press('Enter');
    await eliminationAppeared;
    await Promise.all([
      waitForSignatureText(page, 'LXX-844', 'N766'),
      waitForSignatureText(second.page, 'LXX-844', 'N766'),
    ]);
    check(
      'C247 entry eliminates LXX-844 to N766 and toasts only the acting client',
      (await eliminationToast.count()) === 1
      && (await second.page.locator('[data-sonner-toast]', {
        hasText: 'LXX-844 has been identified.',
      }).count()) === 0,
    );
    await page
      .getByPlaceholder('Type code — e.g. B274 or K162')
      .waitFor({ state: 'detached', timeout: 10_000 });
    check(
      'typed and eliminated codes render with their destination classes',
      (await signatureRowShows(page, 'CBA-120', 'C247'))
      && (await signatureRowShows(page, 'CBA-120', 'C3'))
      && (await signatureRowShows(page, 'LXX-844', 'N766'))
      && (await signatureRowShows(page, 'LXX-844', 'C2')),
    );

    await restampFreshness();
    await pasteScan(page, SCAN_WITHOUT_LXX);
    const lxxRow = signatureRow(page, 'LXX-844');
    await lxxRow
      .locator('xpath=self::*[@data-signature-missing]')
      .waitFor({ state: 'attached', timeout: 15_000 });
    await missingPrompt().waitFor({ state: 'visible', timeout: 10_000 });
    await missingPrompt().getByRole('button', { name: 'Remove' }).click();
    await Promise.all([
      lxxRow.waitFor({ state: 'detached', timeout: 15_000 }),
      signatureRow(second.page, 'LXX-844').waitFor({
        state: 'detached',
        timeout: 15_000,
      }),
      waitForTopology(page, 3, 2),
      waitForTopology(second.page, 3, 2),
    ]);
    check(
      'wormhole removal restores its guaranteed static on both clients',
      (await page.locator('[data-chain-node-static-stub]').count()) === 1
      && (await second.page.locator('[data-chain-node-static-stub]').count()) === 1
      && await hasStubReadout(
        page.locator('[data-chain-node-static-stub]'),
        'N766',
        'C2',
      ),
    );

    const jump = await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:advanceTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        fromSolarSystemId: ORIGIN_SYSTEM_ID,
        toSolarSystemId: DESTINATION_SYSTEM_ID,
        prevFresh: true,
        transitionObservedAt: Date.now(),
      });
    });
    check(
      'the real doorbell resolves the jump',
      jump?.status === 'processed'
      && ['authored', 'converged'].includes(jump?.outcome),
    );
    await Promise.all([

      waitForTopology(page, 4, 3),
      waitForTopology(second.page, 4, 3),
    ]);
    check(
      'jump resolution retires C247 while both systems keep their open statics',
      (await stubCount(page)) === 2 && (await stubCount(second.page)) === 2
      && (await page.locator('[data-chain-node-static-stub]').allTextContents())
        .some((text) => text.includes('N766') && text.includes('C2'))
      && (await page.locator('[data-chain-node-static-stub]').allTextContents())
        .some((text) => text.includes('U210')),
    );

    check(
      'unique survivor auto-resolves without a jump prompt',
      (await page.locator('[data-signature-jump-prompt]').count()) === 0,
    );
    check(
      'the unique match settles two systems plus both remaining statics',
      (await page.locator('[data-chain-node]').count()) === 4
      && (await page.locator('.react-flow__edge').count()) === 3,
    );

    const scannerText =
      (await page.locator('[data-signature-window]').textContent()) ?? '';
    check(
      'scanner window lists the destination after the jump, not the origin scan',
      !/CBA-120/.test(scannerText) && !/LXX-844/.test(scannerText),
    );
    const dockText = (await mapWindow(page, 'dock').textContent()) ?? '';
    check(
      'the current-system dock follows the destination',
      /J160650/.test(dockText) && !/3 signatures/.test(dockText),
    );
  },
};
