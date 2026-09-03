import {
  atlasWindowRoute,
  clickExposedPane,
  dragNodeDisc,
  exposedPanePoint,
  mapWindow,
  openSummary,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

const offset = async (node, card) => {
  const nodeBox = await node.boundingBox();
  const cardBox = await card.boundingBox();
  if (nodeBox === null || cardBox === null) return null;
  return {
    x: cardBox.x - (nodeBox.x + nodeBox.width / 2),
    y: cardBox.y - (nodeBox.y + nodeBox.height / 2),
  };
};

const near = (a, b) =>
  a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) <= 3;

export default {
  name: 'atlas-window-track',
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
    const target = await openSummary(page);
    const card = mapWindow(page, 'summary');
    check('a non-root selection opens the summary card', target !== null && await card.isVisible());
    if (target === null) return;
    await page.waitForTimeout(1100);
    const initial = await offset(target.node, card);

    const panePoint = await exposedPanePoint(page);
    if (panePoint === null) {
      throw new Error('No exposed pane point is available for pan and zoom proof');
    }
    await page.mouse.move(panePoint.x, panePoint.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(panePoint.x + 40, panePoint.y + 30, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(100);
    check('the card tracks its node through pan', near(initial, await offset(target.node, card)));

    await page.mouse.move(panePoint.x, panePoint.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(150);
    check('the card tracks its node through zoom', near(initial, await offset(target.node, card)));

    await dragNodeDisc(page, target, { x: 40, y: 24 });
    await page.waitForTimeout(150);
    check('the card tracks a direct drag of its anchor node', near(initial, await offset(target.node, card)));

    check('an exposed pane point remains available for deselection', await clickExposedPane(page));
    check(
      'deselection closes the card while the dock stands',
      !(await card.isVisible()) && await mapWindow(page, 'dock').isVisible(),
    );
    await shot('node-anchored-summary');
  },
};
