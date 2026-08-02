// SC-2.2: Chromium vs a second engine on the same paused chain state.
// Run with the primary engine (chromium) and UX_SECOND_ENGINE=firefox|webkit.
import {
  allPositionsFinite,
  positionsMatch,
  readNodePositions,
} from '../lib/read-node-positions.mjs';

export default {
  name: 'atlas-layout-cross-engine',
  route: process.env.UX_MAP_ID
    ? `/atlas?map=${process.env.UX_MAP_ID}`
    : '/atlas',
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot, createContext, baseUrl, engine }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }
    const secondEngine = process.env.UX_SECOND_ENGINE ?? 'firefox';
    if (secondEngine === engine) {
      check('UX_SECOND_ENGINE differs from the primary engine', false);
      return;
    }

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 20,
      null,
      { timeout: 120_000 },
    );

    const second = await createContext({ engineName: secondEngine });
    await second.page.goto(
      new URL(`/atlas?map=${process.env.UX_MAP_ID}`, baseUrl).href,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await second.page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 20,
      null,
      { timeout: 120_000 },
    );
    await second.page.waitForTimeout(1500);


    const a = await readNodePositions(page);
    const b = await readNodePositions(second.page);
    check('every parsed position is a finite number', allPositionsFinite(a) && allPositionsFinite(b));
    check(
      `positions identical across ${engine} and ${secondEngine} (0.01px CSS read-back tolerance)`,
      a.length >= 20 && positionsMatch(a, b),
    );

    await shot(`cross-engine-${engine}`);
  },
};
