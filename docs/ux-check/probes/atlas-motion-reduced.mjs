import { calmAtlasCamera, dragNodeDisc, hittableNode, setAtlasMapPreference } from '../lib/window-helpers.mjs';
import { convexRun } from '../lib/authoring-helpers.mjs';
import {
  installMotionMetrics,
  readBirths,
  startGeometrySample,
  stopGeometrySample,
} from '../lib/motion-metrics.mjs';
import { readNodePositions } from '../lib/read-node-positions.mjs';


const PROBE_ID_OFFSET =
  (Date.now() % 99_000) + Math.floor(Math.random() * 1_000);
const CONTROL_SYSTEM_ID = 99_200_000 + PROBE_ID_OFFSET;
const REDUCED_SYSTEM_ID = 99_300_000 + PROBE_ID_OFFSET;

const scaleAnimatedFrame = (frame) =>
  frame.scale !== null && frame.scale !== 'none' && Number(frame.scale) < 0.999;

const fadeFrame = (frame) => frame.opacity !== null && frame.opacity < 0.999;

async function insertSystem(mapId, systemId) {
  await convexRun('mapFixturePlace:placeSystemFixture', { mapId, systemId });
}

async function sampledShift(page) {
    await calmAtlasCamera(page);
    const target = await hittableNode(page);
    if (target === null) throw new Error('BLOCKED: motion fixture has no hittable node');
    if (!await dragNodeDisc(page, target, { x: 80, y: 45 })) throw new Error('Motion fixture drag failed');

  const before = await readNodePositions(page);
  await startGeometrySample(page);
  await setAtlasMapPreference(page, 'auto layout', true);
  await page.waitForTimeout(2500);
  const geometry = await stopGeometrySample(page);
  const settled = await readNodePositions(page);
  return { before, geometry, settled };
}

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
  get route() { return process.env.UX_MAP_ID ? `/atlas?map=${process.env.UX_MAP_ID}` : '/atlas'; },
  viewports: ['desktop'],
  requiresAuth: true,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check }) {
    const mapId = process.env.UX_MAP_ID;
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(1600);

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

    const controlShift = await sampledShift(page);
    check(
      'control: the forced shift shows at least one intermediate glide frame',
      intermediateFrames(controlShift).length >= 1,
    );

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

    const reducedShift = await sampledShift(page);
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

  },
};
