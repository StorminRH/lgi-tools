// Session 4.0.4.3.1 G-1: two authenticated clients watch the full scanner
// lifecycle on a fresh disposable map — paste → re-paste (no churn) → per-kind
// missing (dismiss, remove, undo) → guaranteed-statics accounting →
// typed-code elimination + toast → real jump resolving one stub while the
// other guaranteed static remains visible.
// One-shot by design: the map keeps its rows, jump, and ledger for review.
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

const CHARACTER_ID = 9_000_001; // Synthetic E2E pilot seeded in Neon.
const ORIGIN_SYSTEM_ID = 31_001_677; // J113551 — C247 + N766 statics.
const DESTINATION_SYSTEM_ID = 31_000_880; // J160650 — C3, C247's destination class.
const SHIP_TYPE_ID = 28_606; // Orca — legal through C247's mass cap.

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

/**
 * Dispatch a synthetic scanner paste at the page-level listener. The handler
 * reads event.clipboardData and only yields to editable targets, so a
 * DataTransfer-backed ClipboardEvent on document.body exercises the real path
 * and stays isolated per client (unlike the browser-wide real clipboard).
 */
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
    ({ id, text }) =>
      document
        .querySelector(`[data-signature-row][data-signature-id="${id}"]`)
        ?.textContent?.includes(text) === true,
    { id: signatureId, text: expected },
    { timeout: 30_000 },
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

    // Track the pilot into the origin so paste has a verified target system.
    const seededTransitionAt = Date.now();
    await doorbellAfter(page, async () => {
      await convexRun('mapFixtures:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: seededTransitionAt,
      });
    });
    // The live tokenless engine overwrites the synthetic pilot's coverage
    // stamp within one ~30s cycle, and account-level paste requires a covered
    // online pilot. Re-stamp (same transition epoch — no doorbell re-ring)
    // before each later paste so the gate sees honest coverage, exactly as a
    // real pilot's clean engine run would provide.
    const restampFreshness = () =>
      convexRun('mapFixtures:seedTrackedLocationFixture', {
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

    // Paste 1: unidentified rows claim the already-drawn static holes first,
    // so the canvas keeps two ghosts rather than double-counting four holes.
    // Static/codex convergence can outlive the tokenless engine's first
    // coverage sweep, so refresh the synthetic pilot immediately before the
    // paste just as every later paste does.
    await restampFreshness();
    await pasteScan(page, FULL_SCAN);
    await Promise.all([
      waitForSignatureRows(page, 4), // Signatures tab: CBA, LXX, IHJ, EAR.
      waitForSignatureRows(second.page, 4),
      waitForTopology(page, 3, 2), // origin + two stubs, two provisional edges.
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
      'both scanner kind tabs render',
      (await page.getByRole('tab', { name: 'Signatures' }).count()) === 1
      && (await page.getByRole('tab', { name: 'Anomalies' }).count()) === 1,
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

    // Re-paste the identical scan: no new rows, no new nodes, no churn.
    await pasteScan(page, FULL_SCAN);
    await page.waitForTimeout(1_500);
    check(
      'unchanged re-paste leaves rows, stubs, and edges untouched',
      (await page.locator('[data-signature-row]').count()) === 4
      && (await stubCount(page)) === 2
      && (await page.locator('.react-flow__edge').count()) === 2,
    );

    // Paste without EAR-696: per-kind missing flags it on the pasting client only.
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

    // Flag it again, remove from the bulk prompt (no confirm dialog), then undo.
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

    // Type C247 on CBA-120 through the row editor. The one remaining unknown
    // must eliminate to N766; only the acting client gets the transient toast.
    await signatureRow(page, 'CBA-120')
      .getByRole('button', { name: 'Edit wormhole CBA-120' })
      .click();
    const typeInput = page.getByPlaceholder('Type code — e.g. B274 or K162');
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
    await page.getByRole('button', { name: 'Close Signature Editor' }).click();
    await page
      .getByPlaceholder('Type code — e.g. B274 or K162')
      .waitFor({ state: 'detached', timeout: 10_000 });
    const cbaText = (await signatureRow(page, 'CBA-120').textContent()) ?? '';
    check(
      'typed and eliminated codes render with their destination classes',
      cbaText.includes('C247') && cbaText.includes('C3')
      && /N766/.test((await signatureRow(page, 'LXX-844').textContent()) ?? '')
      && /C2/.test((await signatureRow(page, 'LXX-844').textContent()) ?? ''),
    );

    // Remove the second, untyped hole via the same prompt Remove — its
    // stub departs both clients through the one collapse pathway.
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
      waitForTopology(page, 3, 2), // origin + C247 row + restored N766 static.
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

    // Jump through the typed hole: the stub resolves into the authored system
    // on the same row — no duplicate, no leftover stub, no ambiguity prompt.
    const jump = await doorbellAfter(page, async () => {
      await convexRun('mapFixtures:advanceTrackedLocationFixture', {
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
      // Both identified systems carry their guaranteed open statics: the
      // origin's N766 and the destination's U210.
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

    // A unique survivor resolves without a prompt; ambiguity alone asks the
    // scanner-overlay question (4.0.4.3.2 ruling D-H).
    check(
      'unique survivor auto-resolves without a jump prompt',
      (await page.locator('[data-signature-jump-prompt]').count()) === 0,
    );
    check(
      'the unique match settles two systems plus both remaining statics',
      (await page.locator('[data-chain-node]').count()) === 4
      && (await page.locator('.react-flow__edge').count()) === 3,
    );

    // The scanner window stays on the chain root; the pilot's destination
    // rows are reachable through that system's summary card, not by retargeting.
    check(
      'scanner window keeps the chain-root signature rows after the jump',
      /CBA-120/.test(
        (await page.locator('[data-signature-window]').textContent()) ?? '',
      ),
    );
    // The chain-root dock renders the origin's shared intelligence body, so
    // its scanner summary proves the resolved wormhole's row survived with
    // its system (3 signatures: CBA-120, IHJ-610, EAR-696 · 1 anomaly).
    const dockText = (await mapWindow(page, 'dock').textContent()) ?? '';
    check(
      'the chain-root dock keeps the origin scanner summary',
      /3 signatures/.test(dockText) && /1 anomal/.test(dockText),
    );
  },
};
