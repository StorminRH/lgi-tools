import { assertMovementOutcome } from '../../../e2e/route-contracts.cjs';
import { expect } from '@playwright/test';
import { atlasWindowRoute, dragNodeDisc, hittableNode, settleMapViewport, waitForWindowMap } from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-motion-drag', get route() { return atlasWindowRoute(); },
  viewports: ['desktop'], requiresAuth: true,
  async run({ page }) {
    await waitForWindowMap(page);
    const target = await hittableNode(page);
    if (target === null) throw new Error('BLOCKED: run-owned map has no hittable node');
    const before = await target.node.boundingBox();
    if (before === null) throw new Error('BLOCKED: node has no painted bounds');
    const delta = { x: 70, y: 40 };
    expect(await dragNodeDisc(page, target, delta)).toBe(true);
    await settleMapViewport(page);
    const after = await target.node.boundingBox();
    if (after === null) throw new Error('Dragged node disappeared');
    assertMovementOutcome({ before, after, minimumDistance: 60 });
    await expect.poll(async () => {
      const after = await target.node.boundingBox();
      return after === null ? Infinity : Math.hypot(after.x - before.x - delta.x, after.y - before.y - delta.y);
    }, { message: 'released node remains at the requested drag destination' }).toBeLessThan(4);
  },
};
