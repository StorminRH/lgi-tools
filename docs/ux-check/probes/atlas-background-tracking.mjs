// Hidden-tab background tracking (4.0.4.2.3 SC-5, the folded PR #368
// validation): with the page hidden and the virtual clock far past the old
// 60-second window, fixture jumps still land and pilot presence still
// updates; past the AFK threshold the FEED ITSELF pauses (heartbeat frames
// stop on the Convex websocket — the primary observable) and presence then
// renders the honest `Stale` state. Composes the tracked-location fixtures
// with atlas-afk-gate's virtual-clock + visibility-shadow technique.
//
// Fixture timestamps are split on purpose: `transitionObservedAt` uses REAL
// time (the server's doorbell capture window compares against real now),
// while `feedFreshAt` uses the page's VIRTUAL now (presence staleness is
// evaluated against the virtualized client clock).
//
// Requires authenticated storage state and a fresh empty UX_BG_MAP_ID map
// (disposable, like the jump probe's map — the authored jump stays behind).
import {
  backgroundTrackingMapId,
  backgroundTrackingRoute,
  convexRun,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const CHARACTER_ID = 9_000_001; // Synthetic E2E pilot seeded in Neon.
const ORIGIN_SYSTEM_ID = 31_001_677; // J113551 — C247 + N766 statics.
const DESTINATION_SYSTEM_ID = 31_000_880; // J160650 — C3, behind the C247.
const SHIP_TYPE_ID = 28_606; // Orca — legal through C247's cap.

// Shared between setup() and run(); reset in setup (single desktop viewport).
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

/** The badge inside one node's frame, by system id. */
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
    // Clock before navigation; WS listener before the Convex socket opens,
    // with the frame handler attached synchronously (no await in between —
    // buffered frames are lost forever otherwise).
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

    // ── Seed: pilot at the origin, feed fresh, one scanned C247 slot ────────
    const seed = await doorbellAfter(page, async () => {
      await convexRun('mapFixtures:seedTrackedLocationFixture', {
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
    await convexRun('mapFixtures:upsertUnresolvedHole', {
      mapId,
      fromSystemId: ORIGIN_SYSTEM_ID,
      fromSignatureId: 'AAA-111',
      wormholeTypeCode: 'C247',
      shipSize: 'L',
    });

    // ── Hidden past the old 60s window: the jump still lands ────────────────
    const beatsBeforeHidden = heartbeatFrames;
    check('heartbeats flowed while visible', beatsBeforeHidden > 0);
    await setVisibility(page, 'hidden');
    await page.clock.fastForward('00:02:30');

    const jump = await doorbellAfter(page, async () => {
      await convexRun('mapFixtures:advanceTrackedLocationFixture', {
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

    // ── Return jump: presence comes home; the dock row is live again ────────
    const returned = await doorbellAfter(page, async () => {
      await convexRun('mapFixtures:advanceTrackedLocationFixture', {
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

    // ── No pause before the AFK threshold ────────────────────────────────────
    const beatsMidHidden = heartbeatFrames;
    await page.clock.fastForward('00:30:00');
    await page.waitForTimeout(500);
    check(
      'heartbeats keep flowing 30+ minutes hidden (no pre-AFK pause)',
      heartbeatFrames > beatsMidHidden,
    );

    // ── Past the threshold: prompt, then the feed itself pauses ─────────────
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

    // ── Secondary display check: the stale state is rendered honestly ───────
    const staleBadge = badgeIn(page, ORIGIN_SYSTEM_ID);
    check(
      'badge dims to the stale tone once the feed is old',
      (await staleBadge.getAttribute('data-pilot-presence')) === 'stale',
    );
    check(
      'dock row renders the single-word Stale status',
      (await dockRow.locator('[data-presence-status]').getAttribute('data-presence-status'))
        === 'Stale',
    );

    // ── Return + dismiss resumes the feed (headless flavor of the #368 item) ─
    await setVisibility(page, 'visible');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(1_000);
    check('Continue dismisses the prompt', (await page.getByRole('dialog').count()) === 0);
    check('dismissal resumes heartbeating with a mount beat', heartbeatFrames > beatsAtPause);
  },
};
