// SC-2.2 / SC-2.3 / V-4: a forced re-layout (dial commit) glides its movers
// with every edge endpoint tracking its node's rim on every sampled frame,
// and the in-page frame-time series across the glide measurement window holds
// the dev-mode budget at the 50–60 node ceiling. Requires authenticated
// storage state and UX_MAP_ID pointing at a replayed 50–60 node chain.
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

/** Disc geometry mirrored from SystemNode: radius 22, disc atop the column. */
const DISC_RADIUS = 22;

/** Distance from an edge endpoint to a node's disc rim. */
function rimError(endpoint, node) {
  const cx = node.x + node.width / 2;
  const cy = node.y + DISC_RADIUS;
  const distance = Math.hypot(endpoint.x - cx, endpoint.y - cy);
  return Math.abs(distance - DISC_RADIUS);
}

/** True when some node's rim carries this endpoint (within tolerance). */
function onSomeRim(endpoint, nodes, tolerance) {
  return nodes.some(
    (node) => node.x !== null && rimError(endpoint, node) <= tolerance,
  );
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

    // Open the layout dial group and force a re-layout through a real commit.
    await page.getByText('Layout dials').click();
    const before = await readNodePositions(page);
    const beforeById = new Map(before.map((node) => [String(node.id), node]));

    await startFrameCapture(page);
    await startGeometrySample(page);
    await page.getByRole('button', { name: 'Increase Ring spacing' }).click();
    // Worker layout + merge + the mid-tier glide, plus tail.
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

    // In-window witness: sampled frames where a mover sits strictly between
    // its origin and its target.
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

    // Edge tracking: on EVERY sampled frame, each parsed edge endpoint lies on
    // some node's rim — a desynchronized edge would strand an endpoint away
    // from every disc.
    let checkedEdges = 0;
    const desynchronized = geometry.some((frame) =>
      frame.edges.some((edge) => {
        if (edge.x1 === null) return false;
        checkedEdges += 1;
        return (
          !onSomeRim({ x: edge.x1, y: edge.y1 }, frame.nodes, 1.5)
          || !onSomeRim({ x: edge.x2, y: edge.y2 }, frame.nodes, 1.5)
        );
      }),
    );
    check(
      `edges track their endpoints on every sampled frame (${checkedEdges} edge samples)`,
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
