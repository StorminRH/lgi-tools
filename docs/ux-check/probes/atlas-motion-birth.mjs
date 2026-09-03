import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  installMotionMetrics,
  readBirths,
} from '../lib/motion-metrics.mjs';
import { readNodePositions } from '../lib/read-node-positions.mjs';

const execFileAsync = promisify(execFile);

const PROBE_SYSTEM_ID =
  99_100_000
  + (Date.now() % 99_000)
  + Math.floor(Math.random() * 1_000);

const animatedFrame = (frame) =>
  (frame.scale !== null && frame.scale !== 'none' && Number(frame.scale) < 0.999)
  || (frame.opacity !== null && frame.opacity < 0.999);

const noTravel = (record, settled) =>
  record.insert !== null
  && Math.abs(record.insert.x - settled.x) <= 0.01
  && Math.abs(record.insert.y - settled.y) <= 0.01
  && record.frames.every(
    (frame) =>
      frame.x === null
      || (Math.abs(frame.x - settled.x) <= 0.01 && Math.abs(frame.y - settled.y) <= 0.01),
  );

export default {
  name: 'atlas-motion-birth',
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

    const initialBirths = await readBirths(page);
    const initialSettled = new Map(
      (await readNodePositions(page)).map((node) => [String(node.id), node]),
    );

    const witnessed = Object.keys(initialBirths);
    check('the insertion witness recorded the initial load', witnessed.length >= 1);

    const stable = witnessed.filter((id) => {
      const settled = initialSettled.get(id);
      return settled !== undefined && noTravel(initialBirths[id], settled);
    });
    check(
      `initial-load births surface in place (${stable.length}/${witnessed.length} stable)`,
      stable.length >= Math.ceil(witnessed.length * 0.8),
    );
    check(
      'at least one initial birth shows in-window scale/opacity animation',
      witnessed.some((id) => initialBirths[id].frames.some(animatedFrame)),
    );

    await execFileAsync(
      'pnpm',
      [
        'exec',
        'convex',
        'run',
        'mapFixturePlace:placeSystemFixture',
        JSON.stringify({ mapId, systemId: PROBE_SYSTEM_ID }),
      ],
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`) !== null,
      String(PROBE_SYSTEM_ID),
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1600);

    const births = await readBirths(page);
    const settledNow = new Map(
      (await readNodePositions(page)).map((node) => [String(node.id), node]),
    );
    const liveRecord = births[String(PROBE_SYSTEM_ID)];
    const liveSettled = settledNow.get(String(PROBE_SYSTEM_ID));
    check('the live insertion was witnessed at DOM insertion', liveRecord !== undefined);
    check(
      'the live birth surfaces in place — insertion x/y equals settled x/y with no travel',
      liveRecord !== undefined
        && liveSettled !== undefined
        && noTravel(liveRecord, liveSettled),
    );
    check(
      'the live birth animates scale/opacity inside its window',
      liveRecord !== undefined && liveRecord.frames.some(animatedFrame),
    );

    await shot('birth');
  },
};
