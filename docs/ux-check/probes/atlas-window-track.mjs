import {
  atlasWindowRoute,
  clickExposedPane,
  exposedPanePoint,
  openSummary,
  waitForWindowMap,
} from '../lib/window-helpers.mjs';

const offset = async (node, card) => {
  const nodeBox = await node.boundingBox();
  const cardBox = await card.boundingBox();
  if (nodeBox === null || cardBox === null) return null;
  return { x: cardBox.x - (nodeBox.x + nodeBox.width), y: cardBox.y - nodeBox.y };
};

const near = (a, b) =>
  a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) <= 2;

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
    const node = await openSummary(page);
    const card = page.locator('[data-map-window="summary"]');
    check('a non-root selection opens the summary card', node !== null && await card.isVisible());
    if (node === null) return;
    const initial = await offset(node, card);

    const panePoint = await exposedPanePoint(page);
    if (panePoint !== null) {
      await page.mouse.move(panePoint.x, panePoint.y);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(panePoint.x + 80, panePoint.y + 50, { steps: 5 });
      await page.mouse.up({ button: 'middle' });
    }
    await page.waitForTimeout(100);
    check('the card tracks its node through pan', near(initial, await offset(node, card)));

    if (panePoint !== null) {
      await page.mouse.move(panePoint.x, panePoint.y);
      await page.mouse.wheel(0, -260);
    }
    await page.waitForTimeout(150);
    check('the card tracks its node through zoom', near(initial, await offset(node, card)));

    const lock = page.getByRole('switch', { name: 'Map lock' });
    if (await lock.isChecked()) await lock.click();
    const nodeBox = await node.boundingBox();
    if (nodeBox !== null) {
      await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + 22);
      await page.mouse.down();
      await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 70, nodeBox.y + 62, { steps: 5 });
      await page.mouse.up();
    }
    await page.waitForTimeout(100);
    check('the card tracks a direct drag of its anchor node', near(initial, await offset(node, card)));

    check('an exposed pane point remains available for deselection', await clickExposedPane(page));
    check('deselection closes the card while the dock stands', !(await card.isVisible()) && await page.locator('[data-map-window="dock"]').isVisible());
    await shot('node-anchored-summary');
  },
};
