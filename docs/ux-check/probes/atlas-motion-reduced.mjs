// SC-6.2 / V-3: with prefers-reduced-motion emulated, an insertion appears by
// fade only and a forced shift lands nodes at their targets with no
// intermediate glide frame; the paired control phase (no preference) first
// proves the same scenario animates scale and glides — so the reduced run
// cannot pass vacuously. Requires authenticated storage state, UX_MAP_ID, and
// the local Convex deployment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  installMotionMetrics,
  readBirths,
  startGeometrySample,
  stopGeometrySample,
} from '../lib/motion-metrics.mjs';
import { readNodePositions } from '../lib/read-node-positions.mjs';

const execFileAsync = promisify(execFile);

/** Shared offset below 100_000 keeps the 99_200_000 / 99_300_000 bands disjoint. */
const PROBE_ID_OFFSET =
  (Date.now() % 99_000) + Math.floor(Math.random() * 1_000);
const CONTROL_SYSTEM_ID = 99_200_000 + PROBE_ID_OFFSET;
const REDUCED_SYSTEM_ID = 99_300_000 + PROBE_ID_OFFSET;

const scaleAnimatedFrame = (frame) =>
  frame.scale !== null && frame.scale !== 'none' && Number(frame.scale) < 0.999;

const fadeFrame = (frame) => frame.opacity !== null && frame.opacity < 0.999;

async function insertSystem(mapId, systemId) {
  await execFileAsync(
    'pnpm',
    [
      'exec',
      'convex',
      'run',
      'mapFixturePlace:placeSystemFixture',
      JSON.stringify({ mapId, systemId }),
    ],
    { timeout: 30_000 },
  );
}

/** Runs one dial-commit shift and returns its sampled geometry + endpoints. */
async function sampledShift(page, stepperName) {
  const before = await readNodePositions(page);
  await startGeometrySample(page);
  await page.getByRole('button', { name: stepperName }).click();
  await page.waitForTimeout(2500);
  const geometry = await stopGeometrySample(page);
  const settled = await readNodePositions(page);
  return { before, geometry, settled };
}

/** Sampled frames where some mover sits strictly between origin and target. */
function intermediateFrames({ before, geometry, settled }) {
  const beforeById = new Map(before.map((node) => [String(node.id), node]));
  const settledById = new Map(settled.map((node) => [String(node.id), node]));
  return geometry.filter((frame) =>
    frame.nodes.some((node) => {
      const origin = beforeById.get(String(node.id));
      const target = settledById.get(String(node.id));
      if (origin === undefined || target === undefined || node.x === null) return false;
      if (Math.hypot(target.x - origin.x, target.y - origin.y) <= 2) return false;
      const fromOrigin = Math.hypot(node.x - origin.x, node.y - origin.y);
      const toTarget = Math.hypot(node.x - target.x, node.y - target.y);
      return fromOrigin > 1 && toTarget > 1;
    }),
  );
}

export default {
  name: 'atlas-motion-reduced',
  route: process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas',
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2500,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check, shot }) {
    const mapId = process.env.UX_MAP_ID;
    if (!mapId) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1600);
    await page.getByText('Layout dials').click();

    // ── Control phase: no reduced-motion preference ──────────────────────────
    await insertSystem(mapId, CONTROL_SYSTEM_ID);
    await page.waitForFunction(
      (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`) !== null,
      String(CONTROL_SYSTEM_ID),
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1600);
    const controlBirths = await readBirths(page);
    const controlRecord = controlBirths[String(CONTROL_SYSTEM_ID)];
    check(
      'control: the inserted node plays a scale-animated birth',
      controlRecord !== undefined && controlRecord.frames.some(scaleAnimatedFrame),
    );

    const controlShift = await sampledShift(page, 'Increase Ring spacing');
    check(
      'control: the forced shift shows at least one intermediate glide frame',
      intermediateFrames(controlShift).length >= 1,
    );

    // ── Reduced phase: emulate prefers-reduced-motion live ───────────────────
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await insertSystem(mapId, REDUCED_SYSTEM_ID);
    await page.waitForFunction(
      (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`) !== null,
      String(REDUCED_SYSTEM_ID),
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1600);
    const reducedBirths = await readBirths(page);
    const reducedRecord = reducedBirths[String(REDUCED_SYSTEM_ID)];
    check(
      'reduced: the inserted node appears by fade only — no scale animation',
      reducedRecord !== undefined
        && reducedRecord.frames.some(fadeFrame)
        && !reducedRecord.frames.some(scaleAnimatedFrame),
    );

    const reducedShift = await sampledShift(page, 'Increase Minimum separation');
    const reducedMovers = reducedShift.settled.filter((node) => {
      const origin = reducedShift.before.find(
        (candidate) => String(candidate.id) === String(node.id),
      );
      return (
        origin !== undefined && Math.hypot(node.x - origin.x, node.y - origin.y) > 2
      );
    });
    check(
      `reduced: the shift moved nodes (${reducedMovers.length} movers)`,
      reducedMovers.length >= 1,
    );
    check(
      'reduced: shifted nodes land at their targets with no intermediate glide frame',
      intermediateFrames(reducedShift).length === 0,
    );

    await shot('reduced');
  },
};
