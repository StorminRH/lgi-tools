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

const JSPACE_BASE_SYSTEM_ID = 31_000_001;

const JSPACE_CHAIN_LENGTH = 52;

const KSPACE_EXITS = [
  { atChainIndex: 10, systemId: 30_000_142 },
  { atChainIndex: 25, systemId: 30_002_187 },
  { atChainIndex: 40, systemId: 30_002_659 },
];

const HALO_MAX_SYSTEMS_TOTAL = 150;

const jumpArgs = (mapId, fromSystemId, toSystemId) => ({
  mapId,
  fromSystemId,
  toSystemId,
  wormholeTypeCode: null,
  massState: null,
  shipSize: null,
});

async function seedCeilingChain(mapId) {
  await convexRun('mapFixturePlace:placeSystemFixture', {
    mapId,
    systemId: JSPACE_BASE_SYSTEM_ID,
  });
  for (let index = 1; index < JSPACE_CHAIN_LENGTH; index += 1) {
    await convexRun(
      'mapFixturePlace:placeJumpFixture',
      jumpArgs(mapId, JSPACE_BASE_SYSTEM_ID + index - 1, JSPACE_BASE_SYSTEM_ID + index),
    );
  }
  for (const exit of KSPACE_EXITS) {
    await convexRun(
      'mapFixturePlace:placeJumpFixture',
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

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    const expectedTotalNodes = authoredCount + HALO_MAX_SYSTEMS_TOTAL;
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-chain-node]').length >= expected,
      expectedTotalNodes,
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
