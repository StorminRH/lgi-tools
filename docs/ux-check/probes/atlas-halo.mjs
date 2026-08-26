// K-space halo determinism (4.0.4.2.3 OW3): two authenticated contexts on the
// same fixture map derive the identical halo — same derived-node membership,
// same fog ring flags, same kernel positions — from authored truth plus the
// static adjacency asset alone (SC-2.2), with zero map-writing Convex
// mutations on the wire while the halo renders and idles (SC-2.3 / HC-1).
// Then a fixture jump authors a system already rendered in the halo and both
// clients upgrade the SAME node id in place — derived marker gone, no
// duplicate, surfaced through the shipped `map-node-enter` vocabulary
// (SC-4.1 / SC-4.2).
//
// Requires authenticated storage state and a fresh empty UX_HALO_MAP_ID map
// (disposable: the authored anchor and one jump stay behind).
import {
  convexRun,
  haloMapId,
  haloRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  allPositionsFinite,
  positionsMatch,
  readNodePositions,
} from '../lib/read-node-positions.mjs';

const ANCHOR_SYSTEM_ID = 30_000_142; // Jita — k-space, several gate neighbours.
const HALO_TARGET_SYSTEM_ID = 30_000_144; // Perimeter — ring 1 of Jita's halo.

// Shared between setup() and run(); reset in setup (single desktop viewport).
let mutationPaths = [];

function collectMutations(payload) {
  const text = typeof payload === 'string' ? payload : payload.toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
    if (message !== null && typeof message === 'object' && message.type === 'Mutation') {
      mutationPaths.push(String(message.udfPath ?? 'unknown'));
    }
  }
}

const derivedMembership = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-chain-node-derived]')]
      .map((element) => ({
        id: element.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
        fogged: element.hasAttribute('data-chain-node-fogged'),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  );

const waitForHalo = (page) =>
  page.waitForFunction(
    () => document.querySelectorAll('[data-chain-node-derived]').length >= 10,
    null,
    { timeout: 90_000 },
  );

/** Arms a witness for the shipped enter vocabulary on the upgrade target. */
const armEnterWitness = (page) =>
  page.evaluate((systemId) => {
    window.__haloEnterSeen = false;
    const observer = new MutationObserver(() => {
      const inner = document.querySelector(
        `.react-flow__node[data-id="${systemId}"] [data-chain-node]`,
      );
      if (inner !== null && inner.classList.contains('map-node-enter')) {
        window.__haloEnterSeen = true;
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }, HALO_TARGET_SYSTEM_ID);

const upgradeState = (page) =>
  page.evaluate((systemId) => {
    const wrappers = document.querySelectorAll(
      `.react-flow__node[data-id="${systemId}"]`,
    );
    const inner = wrappers[0]?.querySelector('[data-chain-node]') ?? null;
    return {
      count: wrappers.length,
      derived: inner?.hasAttribute('data-chain-node-derived') ?? null,
      enterSeen: window.__haloEnterSeen === true,
    };
  }, HALO_TARGET_SYSTEM_ID);

export default {
  name: 'atlas-halo',
  route: haloRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2500,
  async setup({ page }) {
    mutationPaths = [];
    // Listener before the Convex socket opens; handler attached synchronously.
    page.on('websocket', (ws) => {
      ws.on('framesent', ({ payload }) => collectMutations(payload));
    });
  },
  async run({ page, check, createContext, baseUrl }) {
    const mapId = haloMapId();
    if (!mapId) {
      check('UX_HALO_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    await waitForEditableMap(page);

    // ── Seed one authored k-space anchor; the halo is pure derivation ───────
    await convexRun('mapFixturePlace:placeSystemFixture', {
      mapId,
      systemId: ANCHOR_SYSTEM_ID,
    });
    await waitForHalo(page);

    // ── Second context derives the identical halo from the same facts ───────
    const second = await createContext();
    second.page.on('websocket', (ws) => {
      ws.on('framesent', ({ payload }) => collectMutations(payload));
    });
    await second.page.goto(new URL(haloRoute(), baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForHalo(second.page);
    await second.page.waitForTimeout(1500);

    const membershipA = await derivedMembership(page);
    const membershipB = await derivedMembership(second.page);
    check(
      'halo has drawn rings and a fogged ring on client A',
      membershipA.length >= 10 &&
        membershipA.some((node) => node.fogged) &&
        membershipA.some((node) => !node.fogged),
    );
    check(
      'both clients derive identical halo membership and fog flags',
      JSON.stringify(membershipA) === JSON.stringify(membershipB),
    );

    const positionsA = await readNodePositions(page);
    const positionsB = await readNodePositions(second.page);
    check(
      'every parsed position is a finite number',
      allPositionsFinite(positionsA) && allPositionsFinite(positionsB),
    );
    check(
      'authored + halo positions identical between the two clients (0.01px tolerance)',
      positionsA.length === membershipA.length + 1 &&
        positionsMatch(positionsA, positionsB),
    );

    // ── Reveal-on-authoring: a jump lands on a rendered halo system ─────────
    check(
      'the upgrade target renders as a derived ring-1 halo node first',
      membershipA.some(
        (node) => node.id === String(HALO_TARGET_SYSTEM_ID) && !node.fogged,
      ),
    );
    await armEnterWitness(page);
    await armEnterWitness(second.page);
    await convexRun('mapFixturePlace:placeJumpFixture', {
      mapId,
      fromSystemId: ANCHOR_SYSTEM_ID,
      toSystemId: HALO_TARGET_SYSTEM_ID,
      wormholeTypeCode: null,
      massState: null,
      shipSize: null,
      eolAt: null,
    });
    for (const target of [page, second.page]) {
      await target
        .waitForFunction(
          (systemId) => {
            const wrappers = document.querySelectorAll(
              `.react-flow__node[data-id="${systemId}"]`,
            );
            const inner = wrappers[0]?.querySelector('[data-chain-node]');
            return (
              wrappers.length === 1 &&
              inner !== null &&
              inner !== undefined &&
              !inner.hasAttribute('data-chain-node-derived')
            );
          },
          HALO_TARGET_SYSTEM_ID,
          { timeout: 30_000 },
        )
        .catch(() => undefined);
    }
    const upgradeA = await upgradeState(page);
    const upgradeB = await upgradeState(second.page);
    check(
      'client A upgrades the same node id in place — one node, derived marker gone',
      upgradeA.count === 1 && upgradeA.derived === false,
    );
    check(
      'client B upgrades the same node id in place — one node, derived marker gone',
      upgradeB.count === 1 && upgradeB.derived === false,
    );
    check(
      'the upgrade surfaced through the shipped map-node-enter vocabulary on both clients',
      upgradeA.enterSeen && upgradeB.enterSeen,
    );

    // ── Zero map-writing mutations across render, upgrade, and idle ─────────
    await page.waitForTimeout(5_000);
    const disallowed = mutationPaths.filter((path) => path !== 'engine:heartbeat');
    check(
      `no Convex mutation beyond the tracking heartbeat crossed the wire (saw: ${
        disallowed.length === 0 ? 'none' : [...new Set(disallowed)].join(', ')
      })`,
      disallowed.length === 0,
    );
  },
};
