import {
  automaticJumpMapId,
  automaticJumpRoute,
  calmMapCamera,
  openFirstEdgeEditor,
  signatureEditor,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  doorbellAfter,
  sessionUserId,
  waitForTopology,
} from '../lib/doorbell-helpers.mjs';

const CHARACTER_ID = 9_000_001;
const ORIGIN_SYSTEM_ID = 31_001_677;
const VERIFIED_DESTINATION_ID = 31_000_880;
const AMBIGUOUS_DESTINATION_ID = 31_000_881;
const SHIP_TYPE_ID = 28_606;

async function advanceLocation({
  mapId,
  userId,
  fromSolarSystemId,
  toSolarSystemId,
  prevFresh,
  transitionObservedAt,
}) {
  await convexRun('mapFixtureTracking:advanceTrackedLocationFixture', {
    mapId,
    userId,
    characterId: CHARACTER_ID,
    fromSolarSystemId,
    toSolarSystemId,
    prevFresh,
    transitionObservedAt,
  });
}

export default {
  name: 'atlas-automatic-jump',
  route: automaticJumpRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, createContext, baseUrl }) {
    const mapId = automaticJumpMapId();
    if (!mapId) {
      check('UX_JUMP_MAP_ID is set for a dedicated empty map', false);
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

    const primaryHome = page.locator('[data-map-home-prompt]');
    const secondHome = second.page.locator('[data-map-home-prompt]');
    check(
      'dedicated jump map starts empty on both clients',
      (await primaryHome.count()) === 1 && (await secondHome.count()) === 1,
    );
    if ((await primaryHome.count()) !== 1 || (await secondHome.count()) !== 1) {
      return;
    }

    const baseTime = Date.now();
    const initial = await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: baseTime,
      });
    });
    await Promise.all([

      waitForTopology(page, 3, 2),
      waitForTopology(second.page, 3, 2),
    ]);
    async function hasStubReadout(stub, name, classification) {
      return (await stub.locator('[data-chain-node-name]').textContent()) === name
        && (await stub.locator('[data-chain-node-classification]').textContent())
          === classification;
    }
    const initialStaticStubs = page.locator('[data-chain-node-static-stub]');
    const secondStaticStubs = second.page.locator('[data-chain-node-static-stub]');
    check(
      'initial subscribed location honestly re-anchors without inventing an edge',
      ((initial?.status === 'skipped' && initial?.reason === 're-anchor')
        || (initial?.status === 'processed' && initial?.outcome === 'converged'))
      && (await initialStaticStubs.count()) === 2
      && await hasStubReadout(initialStaticStubs.nth(0), 'C247', 'C3')
      && await hasStubReadout(initialStaticStubs.nth(1), 'N766', 'C2')
      && (await secondStaticStubs.count()) === 2
      && await hasStubReadout(secondStaticStubs.nth(0), 'C247', 'C3')
      && await hasStubReadout(secondStaticStubs.nth(1), 'N766', 'C2'),
    );

    const accountTrigger = page.locator('[data-account-menu-trigger]').filter({ visible: true });
    await accountTrigger.click();
    const accountMenu = page.locator('[data-account-menu-popup]').filter({ visible: true });
    await accountMenu.waitFor({ state: 'visible', timeout: 10_000 });
    const mapSettings = accountMenu.locator('[data-page-menu-section]');
    const trackingSection = accountMenu.locator('[data-map-tracking]');
    const trackingPortrait = trackingSection.locator(
      `[data-tracking-character-id="${CHARACTER_ID}"]`,
    );
    await mapSettings.waitFor({ state: 'visible', timeout: 10_000 });
    await trackingSection.waitFor({ state: 'visible', timeout: 10_000 });
    check(
      'portrait menu contains Map settings prefs and Tracking portraits',
      (await mapSettings.getByText('Map settings', { exact: true }).count()) === 1
      && (await trackingSection.getByText('Tracking', { exact: true }).count()) === 1,
    );
    await trackingPortrait.waitFor({ state: 'visible', timeout: 10_000 });
    check(
      'the tracked character is bright with an ISK border',
      (await trackingPortrait.getAttribute('data-checked')) !== null
      && (await trackingPortrait.getAttribute('class'))?.includes('data-[checked]:border-isk')
      && (await trackingPortrait.getAttribute('class'))?.includes('data-[checked]:opacity-100'),
    );
    await trackingPortrait.click();
    await page.waitForFunction(
      (characterId) => document
        .querySelector(`[data-tracking-character-id="${characterId}"]`)
        ?.hasAttribute('data-unchecked') === true,
      CHARACTER_ID,
      { timeout: 10_000 },
    );
    check(
      'selecting the portrait stops tracking and dims it without closing the menu',
      await accountMenu.isVisible()
      && (await trackingPortrait.getAttribute('data-unchecked')) !== null
      && (await trackingPortrait.getAttribute('class'))?.includes('opacity-35')
      && (await trackingPortrait.getAttribute('class'))?.includes('border-transparent'),
    );
    await trackingPortrait.click();
    await page.waitForFunction(
      (characterId) => document
        .querySelector(`[data-tracking-character-id="${characterId}"]`)
        ?.hasAttribute('data-checked') === true,
      CHARACTER_ID,
      { timeout: 10_000 },
    );
    check(
      'selecting the portrait again resumes tracking and keeps the menu open',
      await accountMenu.isVisible()
      && (await trackingPortrait.getAttribute('data-checked')) !== null,
    );
    await page.keyboard.press('Escape');
    await accountMenu.waitFor({ state: 'hidden', timeout: 10_000 });

    await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-111',
      wormholeTypeCode: 'C247',
      shipSize: 'L',
    });
    await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-112',
      wormholeTypeCode: 'N766',
      shipSize: 'L',
    });

    const verified = await doorbellAfter(page, async () => {
      await advanceLocation({
        mapId,
        userId,
        fromSolarSystemId: ORIGIN_SYSTEM_ID,
        toSolarSystemId: VERIFIED_DESTINATION_ID,
        prevFresh: true,
        transitionObservedAt: baseTime + 1,
      });
    });
    check(
      'real doorbell processes the verified jump',
      verified?.status === 'processed'
      && ['authored', 'converged'].includes(verified?.outcome),
    );
    await Promise.all([

      waitForTopology(page, 4, 3),
      waitForTopology(second.page, 4, 3),
    ]);
    const postJumpStubs = page.locator('[data-chain-node-static-stub]');
    const postJumpStubTexts = await postJumpStubs.allTextContents();
    check(
      'verified jump fans out authored truth plus both open holes to both clients',
      (await page.locator('[data-chain-node]').count()) === 4
      && (await second.page.locator('[data-chain-node]').count()) === 4
      && (await page.locator('.react-flow__edge').count()) === 3
      && (await second.page.locator('.react-flow__edge').count()) === 3

      && postJumpStubTexts.some((text) => text.includes('U210'))
      && (await second.page.locator('[data-chain-node-static-stub]').allTextContents())
        .some((text) => text.includes('U210')),
    );
    check(
      'unambiguous match needs no confirmation prompt',
      (await page.locator('[data-signature-jump-prompt]').count()) === 0
      && (await second.page.locator('[data-signature-jump-prompt]').count()) === 0,
    );

    await calmMapCamera(page);
    await openFirstEdgeEditor(page);
    const card = signatureEditor(page);
    const typeInput = card.getByPlaceholder('Type code — e.g. B274 or K162');
    check(
      'unambiguous slot auto-links as C247',
      (await typeInput.count()) === 1 && (await typeInput.inputValue()) === 'C247',
    );
    const massRange = (await card.locator('[data-map-connection-mass-range]').textContent()) ?? '';
    check(
      'the card shows the Orca-decremented remaining-mass range',
      /Remaining mass/.test(massRange) && !massRange.includes('2.2B kg'),
    );

    const reanchor = await doorbellAfter(page, async () => {
      await advanceLocation({
        mapId,
        userId,
        fromSolarSystemId: VERIFIED_DESTINATION_ID,
        toSolarSystemId: ORIGIN_SYSTEM_ID,
        prevFresh: false,
        transitionObservedAt: baseTime + 2,
      });
    });
    check(
      'between scenarios the tracked pilot re-anchors without inventing a path',
      reanchor?.status === 'skipped' && reanchor?.reason === 're-anchor',
    );

    for (const signatureId of ['BBB-221', 'BBB-222']) {
      await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
        mapId,
        fromSystemId: ORIGIN_SYSTEM_ID,
        fromSignatureId: signatureId,
      });
    }

    const ambiguous = await doorbellAfter(page, async () => {
      await advanceLocation({
        mapId,
        userId,
        fromSolarSystemId: ORIGIN_SYSTEM_ID,
        toSolarSystemId: AMBIGUOUS_DESTINATION_ID,
        prevFresh: true,
        transitionObservedAt: baseTime + 3,
      });
    });
    check(
      'real doorbell processes the ambiguous jump as an authored result',
      ambiguous?.status === 'processed'
      && ['authored', 'converged'].includes(ambiguous?.outcome),
    );
    await Promise.all([

      waitForTopology(page, 7, 6),
      waitForTopology(second.page, 7, 6),

      page.locator('[data-signature-jump-prompt]').waitFor({ state: 'visible', timeout: 30_000 }),
      second.page.locator('[data-signature-jump-prompt]').waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
    const primaryPrompt = page.locator('[data-signature-jump-prompt]');
    const secondaryPrompt = second.page.locator('[data-signature-jump-prompt]');
    const primaryCandidates = primaryPrompt.locator('[data-signature-jump-candidate]');
    const secondaryCandidates = secondaryPrompt.locator('[data-signature-jump-candidate]');
    check(
      'ambiguous result fans out the jumper-scoped scanner prompt on both same-account clients',
      /J114342 - C3/.test((await primaryPrompt.textContent()) ?? '')
      && (await primaryCandidates.count()) === 2
      && (await secondaryCandidates.count()) === 2,
    );

    await primaryCandidates.nth(1).click();
    await Promise.all([
      primaryPrompt.waitFor({ state: 'detached', timeout: 10_000 }),
      secondaryPrompt.waitFor({ state: 'detached', timeout: 10_000 }),
    ]);
    check(
      'signature pick settles the shared prompt on both clients',
      (await page.locator('[data-signature-jump-prompt]').count()) === 0
      && (await second.page.locator('[data-signature-jump-prompt]').count()) === 0,
    );
  },
};
