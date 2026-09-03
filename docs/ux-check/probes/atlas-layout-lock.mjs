// SC-3.2: unlock → drag → a fixture arrival lands while the node is pinned
// (node and viewport both hold) → re-lock snaps the node exactly home.
// Requires authenticated storage state, UX_MAP_ID with at least one node, and
// the local Convex deployment (the probe drives one arrival through the
// internal fixture mutation).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  closeAtlasMenu,
  openAtlasMenu,
  setAtlasMapPreference,
} from '../lib/window-helpers.mjs';

const execFileAsync = promisify(execFile);

/**
 * A system id no corpus chain uses, unique per run — a repeated id would
 * upsert idempotently, produce no arrival, and hang the probe.
 */
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
  route: process.env.UX_MAP_ID
    ? `/atlas?map=${process.env.UX_MAP_ID}`
    : '/atlas',
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  settle: 2000,
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

    const menu = await openAtlasMenu(page);
    const lockSwitch = menu.getByRole('switch', { name: 'auto layout' });
    check('auto layout control is present in the map settings menu', (await lockSwitch.count()) > 0);
    check(
      'auto layout has no description subtext',
      (await menu.getByText('re-enabling restores the computed layout').count()) === 0,
    );
    await closeAtlasMenu(page);

    // Camera follow off: the arrival below must not be allowed to move the
    // viewport for the follow feature's own reasons — this probe asserts the
    // viewport holds, so the follow toggle has to be out of the picture.
    check(
      'camera follow is off for the round trip',
      (await setAtlasMapPreference(page, 'camera follow', false)) === false,
    );

    // The kernel position, recorded as the node's exact flow transform.
    const kernelTransform = await nodeTransform(page);

    // Unlock (auto layout off = nodes draggable).
    check(
      'auto layout is off for the drag',
      (await setAtlasMapPreference(page, 'auto layout', false)) === false,
    );

    const node = page.locator('[data-chain-node]').first();
    const before = await node.boundingBox();
    check('target node has a box', before !== null);
    if (before === null) return;

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + 120, before.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const pinnedTransform = await nodeTransform(page);
    check('drag moved the node off its kernel position', pinnedTransform !== kernelTransform);

    // One fixture arrival while the node is pinned. The pinned node and the
    // viewport must both hold through the merge it causes.
    const viewportBefore = await viewportTransform(page);
    const nodeCount = await page.locator('[data-chain-node]').count();
    await execFileAsync(
      'pnpm',
      [
        'exec',
        'convex',
        'run',
        'mapFixturePlace:placeSystemFixture',
        JSON.stringify({ mapId, systemId: PROBE_ARRIVAL_SYSTEM_ID }),
      ],
      { timeout: 30_000 },
    );
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

    // Re-enable — clears user placements and forces a kernel merge.
    check(
      'auto layout is re-enabled',
      await setAtlasMapPreference(page, 'auto layout', true),
    );
    await page.waitForTimeout(800);

    check(
      're-lock returned the node exactly to its kernel position',
      (await nodeTransform(page)) === kernelTransform,
    );

    await shot('lock-roundtrip');
  },
};
