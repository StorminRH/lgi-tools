// SC-3.3 / V-1: own-drag is raw one-to-one — the dragged node's rendered
// position matches the dispatched pointer path at every sample, with no
// smoothing — and the frame-time series across the drag window holds the
// dev-mode budget at the 50–60 node ceiling. Requires authenticated storage
// state and UX_MAP_ID pointing at a replayed 50–60 node chain.
import {
  frameStats,
  installMotionMetrics,
  readLoaf,
  startFrameCapture,
  stopFrameCapture,
} from '../lib/motion-metrics.mjs';

export default {
  name: 'atlas-motion-drag',
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

    // Unlock for dragging; keep the camera out of the picture.
    const followSwitch = page.getByRole('switch', { name: 'Camera follow' });
    if (await followSwitch.isChecked()) await followSwitch.click();
    const lockSwitch = page.getByRole('switch', { name: 'Map lock' });
    if (await lockSwitch.isChecked()) await lockSwitch.click();
    check('map is unlocked for the drag', !(await lockSwitch.isChecked()));

    // Grab a node near the viewport center whose disc is actually hittable
    // (floating chrome or the control panel can overlap discs), and keep the
    // drag path bounded around it: a path that nears the viewport edge
    // triggers React Flow's standard drag auto-pan, which moves the canvas
    // under the pointer — ordinary behavior, but it would confound the 1:1
    // witness.
    const viewport = page.viewportSize();
    const centerTarget = { x: viewport.width / 2, y: viewport.height / 2 };
    const discs = page.locator('.map-node-disc');
    const discCount = await discs.count();
    const candidates = [];
    for (let index = 0; index < discCount; index += 1) {
      const box = await discs.nth(index).boundingBox();
      if (box === null) continue;
      candidates.push({
        box,
        index,
        distance: Math.hypot(
          box.x + box.width / 2 - centerTarget.x,
          box.y + box.height / 2 - centerTarget.y,
        ),
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    let grip = null;
    let gripIndex = 0;
    for (const candidate of candidates) {
      const hit = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return element !== null && element.closest('.react-flow__node') !== null;
        },
        {
          x: candidate.box.x + candidate.box.width / 2,
          y: candidate.box.y + candidate.box.height / 2,
        },
      );
      if (hit) {
        grip = candidate;
        gripIndex = candidate.index;
        break;
      }
    }
    check('a hittable central disc was found to grab', grip !== null);
    if (grip === null) return;

    const node = page.locator('.react-flow__node').nth(gripIndex);
    const startBox = await node.boundingBox();
    if (startBox === null) {
      check('the dragged node has a box', false);
      return;
    }

    const gripX = grip.box.x + grip.box.width / 2;
    const gripY = grip.box.y + grip.box.height / 2;
    await page.mouse.move(gripX, gripY);
    await startFrameCapture(page);
    await page.mouse.down();

    // Activate the drag with a small priming move, then re-baseline: the
    // library consumes the activation move as its drag threshold, so the 1:1
    // witness measures from the first post-activation state.
    const startX = gripX + 4;
    const startY = gripY;
    await page.mouse.move(startX, startY);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    const baseline = await node.boundingBox();
    if (baseline === null) {
      check('the dragged node has a baseline box', false);
      return;
    }

    // ~1.5 s of continuous small moves around a bounded loop; sample the
    // node's rendered box against the dispatched pointer at every step.
    const steps = 36;
    let maxDeviation = 0;
    for (let step = 1; step <= steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const pointerX = startX + Math.sin(angle) * 60;
      const pointerY = startY + (Math.cos(angle) - 1) * 45;
      await page.mouse.move(pointerX, pointerY);
      // Two real frames: the pointer event's state update commits on the next
      // frame, and the paint after that is what boundingBox reads. A blind
      // timeout races the event pipeline and reads one move behind.
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }),
      );
      const box = await node.boundingBox();
      if (box === null) continue;
      // One-to-one: the node's box moves exactly with the pointer delta.
      const deviation = Math.hypot(
        box.x - baseline.x - (pointerX - startX),
        box.y - baseline.y - (pointerY - startY),
      );
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    await page.mouse.up();
    const deltas = await stopFrameCapture(page);

    check(
      `the dragged node matches the pointer path at every sample (max deviation ${maxDeviation.toFixed(2)} px)`,
      maxDeviation <= 2,
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

    await shot('drag');
  },
};
