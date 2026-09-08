import {
  allPositionsFinite,
  positionsMatch,
  readNodePositions,
} from '../lib/read-node-positions.mjs';

export default {
  name: 'atlas-layout-cross-engine',
  get route() { return `/atlas?map=${process.env.UX_MAP_ID}`; },
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  async run({ page, check, createContext, baseUrl, engine }) {
    if (!process.env.UX_MAP_ID) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
    const secondEngine = process.env.UX_SECOND_ENGINE ?? 'firefox';
    if (secondEngine === engine) throw new Error(`BLOCKED: required run-owned fixture unavailable`);

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 2,
      null,
      { timeout: 120_000 },
    );

    const second = await createContext({ engineName: secondEngine });
    await second.page.goto(
      new URL(`/atlas?map=${process.env.UX_MAP_ID}`, baseUrl).href,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await second.page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 2,
      null,
      { timeout: 120_000 },
    );
    await second.page.waitForTimeout(1500);

    const a = await readNodePositions(page);
    const b = await readNodePositions(second.page);
    check('every parsed position is a finite number', allPositionsFinite(a) && allPositionsFinite(b));
    check(
      `positions identical across ${engine} and ${secondEngine} (0.01px CSS read-back tolerance)`,
      a.length >= 2 && positionsMatch(a, b),
    );

  },
};
