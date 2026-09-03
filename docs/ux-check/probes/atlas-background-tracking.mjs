import {
  backgroundTrackingMapId,
  backgroundTrackingRoute,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import { settleMapViewport } from '../lib/window-helpers.mjs';

const CHARACTER_ID = 9_000_001;
const ORIGIN_SYSTEM_ID = 31_001_677;
const DESTINATION_SYSTEM_ID = 31_000_880;
const SHIP_TYPE_ID = 28_606;

let heartbeatFrames = 0;
let sampleFrame = null;

async function setVisibility(page, state) {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => next,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => next === 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function sessionUserId(page, baseUrl) {
  const response = await page.request.get(
    new URL('/api/auth/get-session', baseUrl).href,
    { failOnStatusCode: true, timeout: 30_000 },
  );
  const session = await response.json();
  return typeof session?.user?.id === 'string' ? session.user.id : null;
}

function isDoorbellResponse(response) {
  if (
    new URL(response.url()).pathname !== '/api/maps/jump'
    || response.request().method() !== 'POST'
  ) {
    return false;
  }
  try {
    return response.request().postDataJSON()?.kind === 'doorbell';
  } catch {
    return false;
  }
}

async function doorbellAfter(page, trigger) {
  const pending = page.waitForResponse(isDoorbellResponse, { timeout: 30_000 });
  try {
    await trigger();
  } catch (error) {
    void pending.catch(() => undefined);
    throw error;
  }
  const response = await pending;
  return await response.json().catch(() => null);
}

async function waitForTopology(page, nodes, edges) {
  await page.waitForFunction(
    ({ expectedNodes, expectedEdges }) =>
      document.querySelectorAll('[data-chain-node]').length === expectedNodes
      && document.querySelectorAll('.react-flow__edge').length === expectedEdges,
    { expectedNodes: nodes, expectedEdges: edges },
    { timeout: 30_000 },
  );
}

const badgeIn = (page, systemId) =>
  page.locator(`.react-flow__node[data-id="${systemId}"] [data-pilot-presence]`);

const virtualNow = (page) => page.evaluate(() => Date.now());

export default {
  name: 'atlas-background-tracking',
  route: backgroundTrackingRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2500,
  async setup({ page }) {
    heartbeatFrames = 0;
    sampleFrame = null;

    await page.clock.install();
    page.on('websocket', (ws) => {
      ws.on('framesent', ({ payload }) => {
        const text = typeof payload === 'string' ? payload : payload.toString('utf8');
        if (text.includes('engine:heartbeat')) {
          heartbeatFrames += 1;
          if (sampleFrame === null) sampleFrame = text.slice(0, 200);
        }
      });
    });
  },
  async run({ page, check, baseUrl }) {
    const mapId = backgroundTrackingMapId();
    if (!mapId) {
      check('UX_BG_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    const userId = await sessionUserId(page, baseUrl);
    if (userId === null) {
      check('authenticated storage state exposes a session user id', false);
      return;
    }
    await waitForEditableMap(page);

    const seed = await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:seedTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        solarSystemId: ORIGIN_SYSTEM_ID,
        shipTypeId: SHIP_TYPE_ID,
        transitionObservedAt: Date.now(),
        feedFreshAt: await virtualNow(page),
      });
    });
    check('seed doorbell is handled', seed?.status !== undefined);
    await waitForTopology(page, 1, 0);
    await badgeIn(page, ORIGIN_SYSTEM_ID)
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    check(
      'live presence badge renders in the origin frame',
      (await badgeIn(page, ORIGIN_SYSTEM_ID).getAttribute('data-pilot-presence')) === 'live',
    );
    const dockRow = page.locator(
      `[data-map-window="dock"] [data-presence-pilot="${CHARACTER_ID}"]`,
    );
    await dockRow.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    check(
      'dock intelligence lists the pilot as In space',
      (await dockRow.locator('[data-presence-status]').getAttribute('data-presence-status'))
        === 'In space',
    );
    await convexRun('mapFixtureHoles:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-111',
      wormholeTypeCode: 'C247',
      shipSize: 'L',
    });

    const beatsBeforeHidden = heartbeatFrames;
    check('heartbeats flowed while visible', beatsBeforeHidden > 0);
    await setVisibility(page, 'hidden');
    await page.clock.fastForward('00:02:30');

    const jump = await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:advanceTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        fromSolarSystemId: ORIGIN_SYSTEM_ID,
        toSolarSystemId: DESTINATION_SYSTEM_ID,
        prevFresh: true,
        transitionObservedAt: Date.now(),
        feedFreshAt: await virtualNow(page),
      });
    });
    check(
      'hidden-tab jump is processed by the real resolver',
      jump?.status === 'processed' && ['authored', 'converged'].includes(jump?.outcome),
    );
    await waitForTopology(page, 2, 1);
    await badgeIn(page, DESTINATION_SYSTEM_ID)
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    check(
      'presence follows the pilot to the destination while hidden',
      (await badgeIn(page, DESTINATION_SYSTEM_ID).count()) === 1
      && (await badgeIn(page, ORIGIN_SYSTEM_ID).count()) === 0,
    );

    await setVisibility(page, 'visible');

    const destDisc = page.locator(
      `.react-flow__node[data-id="${DESTINATION_SYSTEM_ID}"] .map-node-disc`,
    );
    await destDisc.waitFor({ state: 'visible', timeout: 15_000 });
    await settleMapViewport(page);
    const discBox = await destDisc.boundingBox();
    if (discBox === null) throw new Error('destination disc has no visible bounding box');
    const discPoint = {
      x: discBox.x + discBox.width / 2,
      y: discBox.y + discBox.height / 2,
    };
    const hitDestination = await page.evaluate(
      ({ x, y, id }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('.map-node-disc')
          ?.closest('.react-flow__node')
          ?.getAttribute('data-id') === id,
      { ...discPoint, id: String(DESTINATION_SYSTEM_ID) },
    );
    if (!hitDestination) {
      throw new Error('destination disc center is not the current pointer hit target');
    }
    await page.mouse.click(discPoint.x, discPoint.y);
    const summary = page.locator('[data-map-window="summary"]').filter({ visible: true });
    await summary.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    const summaryHeader = summary.locator('[data-intel-section="summary"]');
    const summaryRow = summary.locator(`[data-presence-pilot="${CHARACTER_ID}"]`);
    await summaryRow.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    check(
      'summary card intelligence header is present',
      (await summaryHeader.count()) === 1,
    );
    const summaryStatus = await summaryRow
      .locator('[data-presence-status]')
      .getAttribute('data-presence-status')
      .catch(() => null);
    check(
      'summary card friendlies list the pilot as In space',
      summaryStatus === 'In space',
    );
    await setVisibility(page, 'hidden');

    const returned = await doorbellAfter(page, async () => {
      await convexRun('mapFixtureTracking:advanceTrackedLocationFixture', {
        mapId,
        userId,
        characterId: CHARACTER_ID,
        fromSolarSystemId: DESTINATION_SYSTEM_ID,
        toSolarSystemId: ORIGIN_SYSTEM_ID,
        prevFresh: true,
        transitionObservedAt: Date.now(),
        feedFreshAt: await virtualNow(page),
      });
    });
    check('hidden-tab return jump is handled without new topology', returned?.status !== undefined);
    await badgeIn(page, ORIGIN_SYSTEM_ID)
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    check(
      'presence returns to the origin while still hidden',
      (await badgeIn(page, ORIGIN_SYSTEM_ID).count()) === 1
      && (await page.locator('[data-chain-node]').count()) === 2,
    );

    const beatsMidHidden = heartbeatFrames;
    await page.clock.fastForward('00:30:00');
    await page.waitForTimeout(500);
    check(
      'heartbeats keep flowing 30+ minutes hidden (no pre-AFK pause)',
      heartbeatFrames > beatsMidHidden,
    );

    await page.clock.fastForward('00:31:00');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    check('AFK prompt appears past the hidden threshold', await dialog.isVisible().catch(() => false));

    await page.clock.fastForward('00:06:00');
    const pausedCopy = page.getByText('location tracking is paused', { exact: false });
    await pausedCopy.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    check('unanswered prompt pauses tracking', (await pausedCopy.count()) > 0);
    await page.waitForTimeout(500);

    const beatsAtPause = heartbeatFrames;
    await page.clock.fastForward('00:05:00');
    await page.waitForTimeout(1_000);
    check(
      `heartbeat frames stop after the AFK pause (sample: ${sampleFrame === null ? 'none' : 'captured'})`,
      heartbeatFrames === beatsAtPause,
    );

    await convexRun('mapFixtureTracking:clearTrackedCoverage', {
      userId,
      characterId: CHARACTER_ID,
    });
    await page.waitForTimeout(500);
    check(
      'badge leaves once coverage flips off',
      (await badgeIn(page, ORIGIN_SYSTEM_ID).count()) === 0,
    );

    await setVisibility(page, 'visible');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1_000);
    check('Continue dismisses the prompt', (await page.getByRole('dialog').count()) === 0);
    check('dismissal resumes heartbeating with a mount beat', heartbeatFrames > beatsAtPause);
  },
};
