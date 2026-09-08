import { expect } from '@playwright/test';
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

const characterId = () => Number(process.env.UX_CHARACTER_ID);
const ORIGIN_SYSTEM_ID = 31_001_677;
const VERIFIED_DESTINATION_ID = 31_000_880;
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
    characterId: characterId(),
    fromSolarSystemId,
    toSolarSystemId,
    prevFresh,
    transitionObservedAt,
  });
}

export default {
  name: 'atlas-automatic-jump',
  get route() { return automaticJumpRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  async run({ page, check, createContext, baseUrl, fixtures }) {
    const expectedObservedMassKg = Number(process.env.E2E_JUMP_EXPECTED_SHIP_MASS_KG);
    const expectedMassReadout = process.env.E2E_JUMP_EXPECTED_REMAINING_MASS_LABEL;
    if (!Number.isSafeInteger(expectedObservedMassKg) || expectedObservedMassKg <= 0
      || !expectedMassReadout?.startsWith('Remaining mass ')) {
      throw new Error('BLOCKED: supply independently verified E2E_JUMP_EXPECTED_SHIP_MASS_KG for type 28606 and the complete E2E_JUMP_EXPECTED_REMAINING_MASS_LABEL for one transit through C247');
    }
    const mapId = automaticJumpMapId();
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
    const userId = await sessionUserId(page, baseUrl);
    if (userId === null) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

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
        characterId: characterId(),
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: baseTime,
      });
      await convexRun('mapStatics:fetchSystemStatics', {
        mapId,
        systemId: ORIGIN_SYSTEM_ID,
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
      `[data-tracking-character-id="${characterId()}"]`,
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
      characterId(),
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
      characterId(),
      { timeout: 10_000 },
    );
    check(
      'selecting the portrait again resumes tracking and keeps the menu open',
      await accountMenu.isVisible()
      && (await trackingPortrait.getAttribute('data-checked')) !== null,
    );
    await page.keyboard.press('Escape');
    await accountMenu.waitFor({ state: 'hidden', timeout: 10_000 });

    const candidate = JSON.parse(await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-111',
      wormholeTypeCode: 'C247',
      shipSize: 'L',
    }));
    if (typeof candidate.connectionId !== 'string') throw new Error('BLOCKED: C247 fixture returned no connection ID');
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
    const matching = (await fixtures.readConnections(mapId)).filter(connection =>
      connection.fromSystemId === ORIGIN_SYSTEM_ID && connection.toSystemId === VERIFIED_DESTINATION_ID);
    expect(matching).toHaveLength(1);
    const [persisted] = matching;
    expect(persisted).toMatchObject({
      fromSystemId: ORIGIN_SYSTEM_ID,
      toSystemId: VERIFIED_DESTINATION_ID,
      observedMassKg: expectedObservedMassKg,
    });
    await expect(card.locator('[data-map-connection-mass-range]')).toHaveText(expectedMassReadout);
    await calmMapCamera(second.page);
    await openFirstEdgeEditor(second.page);
    await expect(signatureEditor(second.page).locator('[data-map-connection-mass-range]')).toHaveText(expectedMassReadout);

  },
};
