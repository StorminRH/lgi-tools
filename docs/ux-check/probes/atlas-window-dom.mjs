import { atlasWindowRoute, waitForWindowMap } from '../lib/window-helpers.mjs';

export default {
  name: 'atlas-window-dom',
  route: atlasWindowRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }
    await waitForWindowMap(page);
    const topology = await page.locator('[data-map-window-layer]').evaluate((layer) => {
      const flow = document.querySelector('.react-flow');
      const motion = document.querySelector('[data-map-motion-scope]');
      return {
        outsideFlow: flow !== null && !flow.contains(layer),
        siblingOfMotion: motion !== null && motion.parentElement === layer.parentElement,
        layerPointerEvents: getComputedStyle(layer).pointerEvents,
        dockUsesPrimitive: layer.querySelectorAll('[data-map-window="dock"]').length === 1,
      };
    });
    check('the window layer is outside the React Flow renderer', topology.outsideFlow);
    check('the window layer is a sibling of the motion/canvas surface', topology.siblingOfMotion);
    check('the full layer is pointer-inert', topology.layerPointerEvents === 'none');
    check('the dock resolves through the one MapWindow primitive', topology.dockUsesPrimitive);
    await shot('sibling-layer-dom');
  },
};
