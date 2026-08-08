// Session 4.0.4.2.2 G-1: two authenticated clients observe the real tracked
// transition → doorbell → server resolver path. The first jump auto-links one
// typed survivor and decrements mass; the second leaves an ambiguous popup for
// operator review. One-shot by design: the authored map remains populated.
import {
  automaticJumpMapId,
  automaticJumpRoute,
  calmMapCamera,
  clickFirstEdge,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  doorbellAfter,
  sessionUserId,
  waitForTopology,
} from '../lib/doorbell-helpers.mjs';

const CHARACTER_ID = 9_000_001; // Synthetic E2E pilot seeded in Neon.
const ORIGIN_SYSTEM_ID = 31_001_677; // J113551 — C247 + N766 statics.
const VERIFIED_DESTINATION_ID = 31_000_880; // J160650 — C3.
const AMBIGUOUS_DESTINATION_ID = 31_000_881; // J114342 — C3.
const SHIP_TYPE_ID = 28_606; // Orca — 150M kg, legal through C247's 300M cap.

async function advanceLocation({
  mapId,
  userId,
  fromSolarSystemId,
  toSolarSystemId,
  prevFresh,
  transitionObservedAt,
}) {
  await convexRun('mapFixtures:advanceTrackedLocationFixture', {
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
      await convexRun('mapFixtures:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: baseTime,
      });
    });
    await Promise.all([
      waitForTopology(page, 1, 0),
      waitForTopology(second.page, 1, 0),
    ]);
    check(
      'initial subscribed location honestly re-anchors without inventing an edge',
      (initial?.status === 'skipped' && initial?.reason === 're-anchor')
      || (initial?.status === 'processed' && initial?.outcome === 'converged'),
    );

    const accountTrigger = page.locator('[data-account-menu-trigger]');
    await accountTrigger.click();
    const accountMenu = page.locator('[data-account-menu-popup]');
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

    await convexRun('mapFixtures:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-111',
      wormholeTypeCode: 'C247',
      shipSize: 'L',
    });
    await convexRun('mapFixtures:upsertUnresolvedHole', {
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
      waitForTopology(page, 2, 1),
      waitForTopology(second.page, 2, 1),
    ]);
    check(
      'verified jump fans out two nodes and one edge to both clients',
      (await page.locator('[data-chain-node]').count()) === 2
      && (await second.page.locator('[data-chain-node]').count()) === 2
      && (await page.locator('.react-flow__edge').count()) === 1
      && (await second.page.locator('.react-flow__edge').count()) === 1,
    );
    check(
      'unambiguous match needs no confirmation prompt',
      (await page.locator('[data-map-jump-prompt]').count()) === 0
      && (await second.page.locator('[data-map-jump-prompt]').count()) === 0,
    );

    await calmMapCamera(page);
    await clickFirstEdge(page);
    const card = page.locator('[data-map-window="connection-details"]');
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
      await convexRun('mapFixtures:upsertUnresolvedHole', {
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
      waitForTopology(page, 3, 2),
      waitForTopology(second.page, 3, 2),
      page.locator('[data-map-jump-prompt]').waitFor({ state: 'visible', timeout: 30_000 }),
      second.page.locator('[data-map-jump-prompt]').waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
    check(
      'ambiguous result fans out and offers confirm/correct on both clients',
      (await page.locator('[data-map-jump-confirm]').count()) === 1
      && (await page.locator('[data-map-jump-correct]').count()) >= 1
      && (await second.page.locator('[data-map-jump-confirm]').count()) === 1
      && (await second.page.locator('[data-map-jump-correct]').count()) >= 1,
    );

    // Next's dev-only route-status portal occupies this same bottom-right
    // corner. Exercise the prompt's keyboard path so that non-production
    // overlay cannot steal the pointer from its visible Dismiss control.
    const dismiss = page.locator('[data-map-jump-dismiss]');
    await dismiss.focus();
    await dismiss.press('Enter');
    await page.locator('[data-map-jump-prompt]').waitFor({ state: 'detached', timeout: 10_000 });
    check(
      'dismissal is client-local and leaves the other client prompt pending',
      (await page.locator('[data-map-jump-prompt]').count()) === 0
      && (await second.page.locator('[data-map-jump-prompt]').count()) === 1,
    );
  },
};
