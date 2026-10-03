import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';

const h = vi.hoisted(() => ({ locationFailed: false, retryLocation: vi.fn() }));

vi.mock('@/components/use-system-search', () => ({ useSystemName: () => undefined }));
vi.mock('./MarketScorePanel', () => ({ MarketScorePanel: () => null }));
vi.mock('./planner-contexts', () => ({
  useMarketData: () => ({ pricing: null, seeded: false, refreshing: false }),
  usePlannerConfig: () => ({ runs: 1, costBasis: 'marginal', setCostBasis: vi.fn() }),
  useBuildPlan: () => ({
    buildTimes: { topJob: null, totalProduction: null, topTe: 0, breakdown: [] },
    skillTimeFactors: { skillTimeFactorOf: () => 1, active: false },
  }),
  useBuildSetup: () => ({
    location: null,
    reactionSystem: null,
    reactionNetAvailable: false,
    structureFactors: { structureTeFactorOf: () => 1 },
    profile: null,
    profilePlan: null,
    locationFailed: h.locationFailed,
    retryLocation: h.retryLocation,
  }),
}));

import { CockpitKpis } from './CockpitKpis';

const structure = { blueprintTypeId: 100, activityId: MANUFACTURING_ACTIVITY } as unknown as BlueprintStructure;
const render = () =>
  renderToStaticMarkup(createElement(CockpitKpis, { structure, marginMode: 'net', setMarginMode: vi.fn() }));

beforeEach(() => {
  h.locationFailed = false;
});

test('fees that keep failing show one retrying notice directly above the margin', () => {
  h.locationFailed = true;
  const html = render();
  const notice = html.indexOf('role="alert"');
  const sell = html.indexOf('>Sell · Jita<');
  const marginTile = html.search(/>(Net|Gross) margin</);
  expect(sell).toBeGreaterThan(-1);
  expect(notice).toBeGreaterThan(sell);
  expect(notice).toBeLessThan(marginTile);
  expect(html).toContain("System fees didn&#x27;t load");
  expect(html).toContain('Net margin is unavailable');
  expect(html).toContain('aria-label="Retry system fees"');
  expect(html).toContain('col-span-full');
});

test('with fees loaded there is no notice', () => {
  expect(render()).not.toContain('role="alert"');
});
