import { calmAtlasCamera, dragNodeDisc, hittableNode, setAtlasMapPreference } from '../lib/window-helpers.mjs';
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
  get route() { return fogBudgetRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check }) {
    const mapId = fogBudgetMapId();
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
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

    const profile = process.env.E2E_BENCHMARK_PROFILE;
    const p50Limit = Number(process.env.E2E_BENCHMARK_P50_MS);
    const p95Limit = Number(process.env.E2E_BENCHMARK_P95_MS);
    if (!profile || !(p50Limit > 0) || !(p95Limit >= p50Limit)) throw new Error('BLOCKED: calibrated E2E_BENCHMARK_PROFILE, P50_MS, and P95_MS are required');
    await calmAtlasCamera(page);
    const target = await hittableNode(page);
    if (target === null) throw new Error('BLOCKED: benchmark has no hittable node');
    if (!await dragNodeDisc(page, target, { x: 80, y: 45 })) throw new Error('Benchmark drag failed');
    await startFrameCapture(page);
    await setAtlasMapPreference(page, 'auto layout', true);
    await page.waitForTimeout(2500);
    const deltas = await stopFrameCapture(page);

    const stats = frameStats(deltas);
    check(
      `calibrated ${profile} frame budget holds at maximum combined load (${stats.count} deltas, p50 ${stats.p50?.toFixed(1)} ms, p95 ${stats.p95?.toFixed(1)} ms)`,
      stats.count >= 60 && stats.p50 !== null && stats.p50 <= p50Limit && stats.p95 <= p95Limit,
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
