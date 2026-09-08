import { calmAtlasCamera, dragNodeDisc, hittableNode, setAtlasMapPreference } from '../lib/window-helpers.mjs';
import {
  installMotionMetrics,
  startFrameCapture,
  startGeometrySample,
  stopFrameCapture,
  stopGeometrySample,
} from '../lib/motion-metrics.mjs';
import { readNodePositions } from '../lib/read-node-positions.mjs';

const FRAME_WIDTH = 150;
const FRAME_HEIGHT = 110;
const DISC_RADIUS = 27.5;

function discRimError(endpoint, node) {
  const width = typeof node.width === 'number' && node.width > 0 ? node.width : FRAME_WIDTH;
  const height =
    typeof node.height === 'number' && node.height > 0 ? node.height : FRAME_HEIGHT;
  const cx = node.x + width / 2;
  const cy = node.y + height / 2;
  return Math.abs(Math.hypot(endpoint.x - cx, endpoint.y - cy) - DISC_RADIUS);
}

function onSomeDisc(endpoint, nodes, tolerance) {
  return nodes.some(
    (node) =>
      node.x !== null
      && node.y !== null
      && discRimError(endpoint, node) <= tolerance,
  );
}

function edgeTracksFrames(edge, nodes, tolerance) {
  const startOn = onSomeDisc({ x: edge.x1, y: edge.y1 }, nodes, tolerance);
  const endOn = onSomeDisc({ x: edge.x2, y: edge.y2 }, nodes, tolerance);
  if (startOn && endOn) return true;
  const fogStub = typeof edge.id === 'string' && edge.id.startsWith('halo:');
  return fogStub && (startOn || endOn);
}

export default {
  name: 'atlas-motion-glide',
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

    const nodeCount = await page.locator('.react-flow__node').count();
    check(`a production-like chain is rendered (${nodeCount} nodes)`, nodeCount >= 2);

    await calmAtlasCamera(page);
    const target = await hittableNode(page);
    if (target === null) throw new Error('BLOCKED: motion fixture has no hittable node');
    if (!await dragNodeDisc(page, target, { x: 80, y: 45 })) throw new Error('Motion fixture drag failed');
    const before = await readNodePositions(page);
    const beforeById = new Map(before.map((node) => [String(node.id), node]));

    await startFrameCapture(page);
    await startGeometrySample(page);
    await setAtlasMapPreference(page, 'auto layout', true);
    await page.waitForTimeout(2500);
    const geometry = await stopGeometrySample(page);
    await stopFrameCapture(page);

    const settled = await readNodePositions(page);
    const settledById = new Map(settled.map((node) => [String(node.id), node]));
    const movers = settled
      .filter((node) => {
        const origin = beforeById.get(String(node.id));
        return (
          origin !== undefined
          && Math.hypot(node.x - origin.x, node.y - origin.y) > 0.5
        );
      })
      .map((node) => String(node.id));
    check(`the relocking the dragged node moves it toward computed layout (${movers.length} movers)`, movers.length >= 1);

    const moverSet = new Set(movers);
    const betweenFrames = geometry.filter((frame) =>
      frame.nodes.some((node) => {
        if (!moverSet.has(String(node.id)) || node.x === null) return false;
        const origin = beforeById.get(String(node.id));
        const target = settledById.get(String(node.id));
        if (origin === undefined || target === undefined) return false;
        const fromOrigin = Math.hypot(node.x - origin.x, node.y - origin.y);
        const toTarget = Math.hypot(node.x - target.x, node.y - target.y);
        return fromOrigin > 1 && toTarget > 1;
      }),
    );
    check(
      `movers glide through intermediate frames (${betweenFrames.length} sampled mid-glide)`,
      betweenFrames.length >= 1,
    );

    let checkedEdges = 0;
    const desynchronized = geometry.some((frame) =>
      frame.edges.some((edge) => {
        if (edge.x1 === null || edge.y1 === null || edge.x2 === null || edge.y2 === null) {
          return false;
        }
        checkedEdges += 1;
        return !edgeTracksFrames(edge, frame.nodes, 1.5);
      }),
    );
    check(
      `edges track their frame endpoints on every sampled frame (${checkedEdges} edge samples)`,
      checkedEdges > 0 && !desynchronized,
    );

  },
};
