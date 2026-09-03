import {
  calmMapCamera,
  convexRun,
  signatureViewerMapId,
  signatureViewerRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  doorbellAfter,
  sessionUserId,
  waitForTopology,
} from '../lib/doorbell-helpers.mjs';

const CHARACTER_ID = 9_000_001;
const ORIGIN_SYSTEM_ID = 31_001_677;
const SHIP_TYPE_ID = 28_606;

const SITE_NAME = 'Barren Perimeter Reservoir';
const SITE_SIGNATURE_ID = 'IHJ-610';
const UNMATCHED_NAME = 'Sansha Hideout';
const UNMATCHED_SIGNATURE_ID = 'CBT-001';

const SCAN = [
  `${SITE_SIGNATURE_ID}\tCosmic Signature\tGas Site\t${SITE_NAME}\t100.0%\t7.69 AU`,
  `${UNMATCHED_SIGNATURE_ID}\tCosmic Signature\tCombat Site\t${UNMATCHED_NAME}\t100.0%\t5.10 AU`,
].join('\n');

async function pasteScan(page, text) {
  await page.evaluate((payload) => {
    const data = new DataTransfer();
    data.setData('text/plain', payload);
    document.body.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }, text);
}

function siteViewer(page) {
  return page.locator('[data-map-window="site-viewer"]');
}

function siteViewerLayer(page) {
  return page.locator('[data-site-viewer="true"]');
}

function viewSiteButton(page) {
  return page.getByRole('button', { name: new RegExp(`View site.*${SITE_NAME}`) });
}

async function openSiteViewer(page) {
  const open = viewSiteButton(page);
  await open.waitFor({ state: 'visible', timeout: 15_000 });
  await open.click({ timeout: 10_000 });
  await siteViewer(page).waitFor({ state: 'visible', timeout: 15_000 });
}

export default {
  name: 'atlas-signature-viewer',
  route: signatureViewerRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2000,
  async run({ page, check, baseUrl }) {
    const mapId = signatureViewerMapId();
    if (!mapId) {
      check('UX_SITE_VIEWER_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    const userId = await sessionUserId(page, baseUrl);
    if (userId === null) {
      check('authenticated storage state exposes a session user id', false);
      return;
    }

    await waitForEditableMap(page);
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
    await waitForTopology(page, 3, 2);

    await convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
      mapId,
      userId,
      characterId: CHARACTER_ID,
      solarSystemId: ORIGIN_SYSTEM_ID,
      shipTypeId: SHIP_TYPE_ID,
      transitionObservedAt: seededTransitionAt,
      feedFreshAt: Date.now(),
    });
    await pasteScan(page, SCAN);
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-signature-row]').length === count,
      2,
      { timeout: 30_000 },
    );

    const siteRow = page.locator(
      `[data-signature-row][data-signature-id="${SITE_SIGNATURE_ID}"]`,
    );
    const unmatchedRow = page.locator(
      `[data-signature-row][data-signature-id="${UNMATCHED_SIGNATURE_ID}"]`,
    );
    check(
      'catalogue-matched site row shows the open affordance',
      (await siteRow.getAttribute('data-signature-row-open')) === 'true'
        && (await viewSiteButton(page).count()) === 1,
    );
    check(
      'catalogue-unmatched named site row stays inert',
      (await unmatchedRow.getAttribute('data-signature-row-open')) === null
        && (await unmatchedRow.getByRole('button').count()) === 0
        && (await page.getByRole('button', { name: `View site ${UNMATCHED_NAME}` }).count())
          === 0,
    );

    await openSiteViewer(page);
    const viewer = siteViewer(page);
    const layer = siteViewerLayer(page);
    const card = viewer.locator('[data-site-card][data-presentation="standalone"]');
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    check(
      'named site row opens the scanner-anchored site viewer',
      (await layer.count()) === 1
        && (await viewer.count()) === 1
        && (await card.count()) === 1,
    );
    check(
      'standalone card chrome is expanded without a card-level collapse',
      (await card.locator(':scope > details[data-collapsible]').count()) === 0
        && (await card.locator('details[data-collapsible] > summary').filter({
          hasText: SITE_NAME,
        }).count()) === 0
        && ((await card.textContent()) ?? '').includes(SITE_NAME),
    );
    check(
      'the shared panel draws a bracket tied to the site row',
      (await layer.locator('[data-signature-editor-bracket]').count()) === 1
        && (await layer.locator('[data-signature-editor-leader]').count()) === 1,
    );

    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'hidden', timeout: 10_000 });
    check(
      'Escape dismisses the site viewer',
      (await siteViewer(page).count()) === 0
        && (await siteViewerLayer(page).count()) === 0,
    );

    await openSiteViewer(page);
    await page.locator('.react-flow__pane').click({
      position: { x: 24, y: 24 },
      timeout: 10_000,
    });
    await siteViewer(page).waitFor({ state: 'hidden', timeout: 10_000 });
    check(
      'outside-click dismisses the site viewer',
      (await siteViewer(page).count()) === 0
        && (await siteViewerLayer(page).count()) === 0,
    );
  },
};
