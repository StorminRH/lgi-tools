import {
  allPositionsFinite,
  positionsMatch,
  readNodePositions,
} from '../lib/read-node-positions.mjs';

export default {
  name: 'atlas-layout-two-clients',
  route: process.env.UX_MAP_ID
    ? `/atlas?map=${process.env.UX_MAP_ID}`
    : '/atlas',
  viewports: ['desktop'],
  reducedMotion: true,
  requiresAuth: true,
  settle: 2000,
  async run({ page, check, shot, createContext, baseUrl }) {
    if (!process.env.UX_MAP_ID) {
      check('UX_MAP_ID is set for the live map under test', false);
      return;
    }

    await page.waitForFunction(
      () => document.querySelectorAll('[data-chain-node]').length >= 20,
      null,
      { timeout: 120_000 },
    );

    const second = await createContext();
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
    check('both clients rendered the same node count', a.length === b.length && a.length >= 20);
    check(
      'all positions identical between the two clients (0.01px CSS read-back tolerance)',
      positionsMatch(a, b),
    );

    await shot('two-clients-a');
    await shot('two-clients-b', { page: second.page });
  },
};
