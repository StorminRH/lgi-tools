// Frame budget at maximum combined load (4.0.4.2.3 OW4, SC-6.2): an authored
// chain at the operator-set 50–60-node ceiling with three k-space exits
// driving the halo to its aggregate cap (150 derived systems), fog active on
// the dynamic tier — a forced re-layout glide must hold the 4.0.3.2 dev-mode
// budget (p50 ≤ 17 ms, p95 ≤ 34 ms over ≥ 60 frame deltas), and the map must
// return to strict stillness afterward (no leaked fog loop at full load).
//
// Requires authenticated storage state and a fresh empty UX_FOG_BUDGET_MAP_ID
// map. The probe seeds ~55 systems through mapFixtures (sequential convex
// runs; expect the seeding phase to take a minute or two) and leaves them
// behind — the map is disposable. Ops mirror atlas-halo:
//   UX_FOG_BUDGET_MAP_ID=<id> node docs/ux-check/run-probes.mjs \
//     --storage-state=docs/ux-check/captures/auth-storage.json atlas-fog-budget
import {
  convexRun,
  fogBudgetMapId,
  fogBudgetRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  frameStats,
  installMotionMetrics,
  readLoaf,
  readRafCount,
  startFrameCapture,
  stopFrameCapture,
} from '../lib/motion-metrics.mjs';

/** Real J-space systems (adjacency-free, so they never contribute halo). */
const JSPACE_BASE_SYSTEM_ID = 31_000_001;

/** Authored chain length in J-space systems. */
const JSPACE_CHAIN_LENGTH = 52;

/** K-space trade hubs — dense gate neighbourhoods drive the halo to its cap. */
const KSPACE_EXITS = [
  { atChainIndex: 10, systemId: 30_000_142 }, // Jita
  { atChainIndex: 25, systemId: 30_002_187 }, // Amarr
  { atChainIndex: 40, systemId: 30_002_659 }, // Dodixie
];

/** Mirrors the pinned aggregate cap (halo-model HALO_MAX_SYSTEMS_TOTAL). */
const HALO_MAX_SYSTEMS_TOTAL = 150;

const jumpArgs = (mapId, fromSystemId, toSystemId) => ({
  mapId,
  fromSystemId,
  toSystemId,
  wormholeTypeCode: null,
  massState: null,
  shipSize: null,
  eolAt: null,
});

/** Seeds the ceiling-sized chain: a J-space line plus three k-space exits. */
async function seedCeilingChain(mapId) {
  await convexRun('mapFixtures:placeSystemFixture', {
    mapId,
    systemId: JSPACE_BASE_SYSTEM_ID,
  });
  for (let index = 1; index < JSPACE_CHAIN_LENGTH; index += 1) {
    await convexRun(
      'mapFixtures:placeJumpFixture',
      jumpArgs(mapId, JSPACE_BASE_SYSTEM_ID + index - 1, JSPACE_BASE_SYSTEM_ID + index),
    );
  }
  for (const exit of KSPACE_EXITS) {
    await convexRun(
      'mapFixtures:placeJumpFixture',
      jumpArgs(mapId, JSPACE_BASE_SYSTEM_ID + exit.atChainIndex, exit.systemId),
    );
  }
  return JSPACE_CHAIN_LENGTH + KSPACE_EXITS.length;
}

export default {
  name: 'atlas-fog-budget',
  route: fogBudgetRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2500,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check }) {
    const mapId = fogBudgetMapId();
    if (!mapId) {
      check('UX_FOG_BUDGET_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    await waitForEditableMap(page);

    const authoredCount = await seedCeilingChain(mapId);

    // One clean load over the fully-seeded map: the budget is measured on the
    // steady state, not on 55 incremental merges.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-chain-node]').length >=
        expected + 100,
      authoredCount,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(2500);

    const counts = await page.evaluate(() => ({
      total: document.querySelectorAll('[data-chain-node]').length,
      derived: document.querySelectorAll('[data-chain-node-derived]').length,
      fogged: document.querySelectorAll('[data-chain-node-fogged]').length,
      fogPainted: (() => {
        const canvas = document.querySelector('[data-map-fog]');
        return canvas !== null && canvas.width > 1;
      })(),
    }));
    const authored = counts.total - counts.derived;
    check(
      `the authored chain sits at the ceiling (${authored} authored systems)`,
      authored >= 50 && authored <= 60,
    );
    check(
      `the halo runs at its aggregate cap (${counts.derived} derived, ${counts.fogged} fogged)`,
      counts.derived === HALO_MAX_SYSTEMS_TOTAL && counts.fogged >= 1,
    );
    check('the fog canvas is painted at full load', counts.fogPainted);

    // ── The budgeted glide: a real dial commit re-layouts everything ────────
    await page.getByText('Layout dials').click();
    await startFrameCapture(page);
    await page.getByRole('button', { name: 'Increase Ring spacing' }).click();
    await page.waitForTimeout(2500);
    const deltas = await stopFrameCapture(page);

    const stats = frameStats(deltas);
    check(
      `the 4.0.3.2 frame budget holds at maximum combined load (${stats.count} deltas, p50 ${stats.p50?.toFixed(1)} ms, p95 ${stats.p95?.toFixed(1)} ms)`,
      stats.count >= 60 && stats.p50 !== null && stats.p50 <= 17 && stats.p95 <= 34,
    );
    const loaf = await readLoaf(page);
    check(
      `supplementary: ${loaf.length} long-animation-frame entr${loaf.length === 1 ? 'y' : 'ies'} recorded (context only)`,
      true,
    );

    // ── Back to stillness: no leaked fog loop at full load ──────────────────
    await page.waitForTimeout(2000);
    const idleStart = await readRafCount(page);
    await page.waitForTimeout(3000);
    const idleEnd = await readRafCount(page);
    check(
      `the full-load map returns to zero animation frames across 3s (${idleEnd - idleStart} registrations)`,
      idleEnd === idleStart,
    );
  },
};
