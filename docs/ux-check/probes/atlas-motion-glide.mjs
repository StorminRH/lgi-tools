// SC-2.2 / SC-2.3 / V-4: a forced re-layout (dial commit) glides its movers
// with every edge endpoint tracking its node's frame perimeter on every
// sampled frame (halo fog stubs keep only the visible end on a frame), and
// the in-page frame-time series across the glide measurement window holds
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

/** Widget-frame fallbacks mirrored from SystemNode declared dimensions. */
const FRAME_WIDTH = 120;
const FRAME_HEIGHT = 88;

/**
 * Distance from an edge endpoint to one node's frame perimeter (0 = on the
 * boundary). Matches `endpointFrame` / `frameSegment` clipping: lines exit
 * at the axis-aligned box, not a disc rim.
 */
function frameBoundaryError(endpoint, node) {
  const width = typeof node.width === 'number' && node.width > 0 ? node.width : FRAME_WIDTH;
  const height =
    typeof node.height === 'number' && node.height > 0 ? node.height : FRAME_HEIGHT;
  const left = node.x;
  const right = node.x + width;
  const top = node.y;
  const bottom = node.y + height;
  const clampedX = Math.min(Math.max(endpoint.x, left), right);
  const clampedY = Math.min(Math.max(endpoint.y, top), bottom);
  const outside = Math.hypot(endpoint.x - clampedX, endpoint.y - clampedY);
  if (outside > 0) return outside;
  return Math.min(endpoint.x - left, right - endpoint.x, endpoint.y - top, bottom - endpoint.y);
}

/** True when some node's frame perimeter carries this endpoint. */
function onSomeFrame(endpoint, nodes, tolerance) {
  return nodes.some(
    (node) =>
      node.x !== null
      && node.y !== null
      && frameBoundaryError(endpoint, node) <= tolerance,
  );
}

/**
 * Full frame-to-frame edges keep both ends on a perimeter; fog stubs (halo
 * edges into ring-3) keep only the visible end on a frame and cut short.
 */
function edgeTracksFrames(edge, nodes, tolerance) {
  const startOn = onSomeFrame({ x: edge.x1, y: edge.y1 }, nodes, tolerance);
  const endOn = onSomeFrame({ x: edge.x2, y: edge.y2 }, nodes, tolerance);
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

    // Edge tracking: on EVERY sampled frame, each parsed edge follows
    // frame-box clipping (both ends on a perimeter, or a halo fog stub with
    // the visible end on a frame). A desynchronized edge strands an endpoint.
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
