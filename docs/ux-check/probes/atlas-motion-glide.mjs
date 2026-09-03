import {
  frameStats,
  installMotionMetrics,
  readLoaf,
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

    const nodeCount = await page.locator('.react-flow__node').count();
    check(`a production-like chain is rendered (${nodeCount} nodes)`, nodeCount >= 40);

    await page.getByText('Layout dials').click();
    const before = await readNodePositions(page);
    const beforeById = new Map(before.map((node) => [String(node.id), node]));

    await startFrameCapture(page);
    await startGeometrySample(page);
    await page.getByRole('button', { name: 'Increase Ring spacing' }).click();

    await page.waitForTimeout(2500);
    const geometry = await stopGeometrySample(page);
    const deltas = await stopFrameCapture(page);

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
    check(`the dial commit moved nodes (${movers.length} movers)`, movers.length >= 1);

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
      betweenFrames.length >= 5,
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

    const stats = frameStats(deltas);
    check(
      `frame series collected ${stats.count} deltas (p50 ${stats.p50?.toFixed(1)} ms, p95 ${stats.p95?.toFixed(1)} ms)`,
      stats.count >= 60 && stats.p50 !== null && stats.p50 <= 17 && stats.p95 <= 34,
    );
    const loaf = await readLoaf(page);
    check(
      `supplementary: ${loaf.length} long-animation-frame entr${loaf.length === 1 ? 'y' : 'ies'} recorded (context only)`,
      true,
    );

    await shot('glide');
  },
};
