import { convexRun } from '../lib/authoring-helpers.mjs';
import {
  closeAtlasMenu,
  openAtlasMenu,
  setAtlasMapPreference,
} from '../lib/window-helpers.mjs';


const PROBE_ARRIVAL_SYSTEM_ID = 99_000_000 + (Date.now() % 1_000_000);

const nodeTransform = (page) =>
  page
    .locator('[data-chain-node]')
    .first()
    .evaluate((element) => element.closest('.react-flow__node').style.transform);

const viewportTransform = (page) =>
  page
    .locator('.react-flow__viewport')
    .evaluate((element) => element.style.transform);

export default {
  name: 'atlas-layout-lock',
  get route() { return `/atlas?map=${process.env.UX_MAP_ID}`; },
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  async run({ page, check }) {
    const mapId = process.env.UX_MAP_ID;
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 1,
      null,
      { timeout: 60_000 },
    );

    const menu = await openAtlasMenu(page);
    const lockSwitch = menu.getByRole('switch', { name: 'auto layout' });
    check('auto layout control is present in the map settings menu', (await lockSwitch.count()) > 0);
    check(
      'auto layout has no description subtext',
      (await menu.getByText('re-enabling restores the computed layout').count()) === 0,
    );
    await closeAtlasMenu(page);

    check(
      'camera follow is off for the round trip',
      (await setAtlasMapPreference(page, 'camera follow', false)) === false,
    );

    const kernelTransform = await nodeTransform(page);

    check(
      'auto layout is off for the drag',
      (await setAtlasMapPreference(page, 'auto layout', false)) === false,
    );

    const node = page.locator('[data-chain-node]').first();
    const before = await node.boundingBox();
    check('target node has a box', before !== null);

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + 120, before.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const pinnedTransform = await nodeTransform(page);
    check('drag moved the node off its kernel position', pinnedTransform !== kernelTransform);

    const viewportBefore = await viewportTransform(page);
    const nodeCount = await page.locator('[data-chain-node]').count();
    await convexRun('mapFixturePlace:placeSystemFixture', { mapId, systemId: PROBE_ARRIVAL_SYSTEM_ID });
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-chain-node]').length > expected,
      nodeCount,
      { timeout: 30_000 },
    );

    check(
      'pinned node held its hand position through the arrival',
      (await nodeTransform(page)) === pinnedTransform,
    );
    check(
      'viewport did not move on the arrival',
      (await viewportTransform(page)) === viewportBefore,
    );

    check(
      'auto layout is re-enabled',
      await setAtlasMapPreference(page, 'auto layout', true),
    );
    await page.waitForTimeout(800);

    check(
      're-lock returned the node exactly to its kernel position',
      (await nodeTransform(page)) === kernelTransform,
    );

  },
};
