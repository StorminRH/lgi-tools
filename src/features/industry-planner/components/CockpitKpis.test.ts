import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';

const h = vi.hoisted(() => ({ locationFailed: false, feesPending: false, retryLocation: vi.fn(), pricing: null as unknown }));

vi.mock('@/components/use-system-search', () => ({ useSystemName: () => undefined }));
vi.mock('./MarketScorePanel', () => ({ MarketScorePanel: () => null }));
vi.mock('./planner-contexts', () => ({
  useMarketData: () => ({ pricing: h.pricing, seeded: true, refreshing: false }),
  usePlannerConfig: () => ({ runs: 1, costBasis: 'marginal', setCostBasis: vi.fn() }),
  useBuildPlan: () => ({
    buildTimes: { topJob: null, totalProduction: null, topTe: 0, breakdown: [] },
    skillTimeFactors: { skillTimeFactorOf: () => 1, active: false },
  }),
  useBuildSetup: () => ({
    location: h.pricing ? { systemName: 'Amamake' } : null,
    reactionSystem: null,
    reactionNetAvailable: false,
    structureFactors: { structureTeFactorOf: () => 1 },
    profile: null,
    profilePlan: null,
    locationFailed: h.locationFailed,
    feesPending: h.feesPending,
    retryLocation: h.retryLocation,
  }),
}));

import { CockpitKpis } from './CockpitKpis';

const structure = { blueprintTypeId: 100, activityId: MANUFACTURING_ACTIVITY } as unknown as BlueprintStructure;
const render = () =>
  renderToStaticMarkup(createElement(CockpitKpis, { structure, marginMode: 'net', setMarginMode: vi.fn() }));

beforeEach(() => {
  h.locationFailed = false;
  h.feesPending = false;
  h.pricing = null;
});

const fee = (missingAdjustedPriceTypeIds: number[]) => ({
  estimatedItemValue: 1_000,
  jobGrossCost: 100,
  facilityTax: 2.5,
  sccSurcharge: 40,
  total: 142.5,
  missingSystemCostIndex: false,
  missingAdjustedPriceTypeIds,
});
const priced = (missing: number[]) => ({
  rows: [],
  intermediatePrices: [],
  product: { typeId: 1, name: 'Widget', quantityPerRun: 1, bestSell: 1_000, pct5Sell: null, staleAfterMs: null, buyDepth: null, sellDepth: null, regionalDiscount: null },
  summary: { basis: 'marginal', bases: { batched: 0, marginal: 0 }, inputCost: 500, revenue: 1_000, margin: 500, marginPct: 50, incomplete: false },
  net: {
    netMargin: 300,
    netMarginPct: 30,
    netCost: 700,
    systemCostIndex: 0.1,
    facilityTaxRate: 0.0025,
    facilityTaxAssumed: true,
    jobFee: fee([]),
    sellSide: { salesTax: 75, brokerFee: 30, total: 105 },
    componentJobs: {
      jobs: [{ typeId: 2, blueprintTypeId: 102, reaction: false, runs: 1, systemId: 1, systemCostIndex: 0.1, facilityTaxRate: 0.0025, fee: fee(missing) }],
      total: 142.5,
    },
  },
});
const feeMark = (html: string) => html.match(/<button[^>]*aria-label="Fee breakdown"[^>]*>/)?.[0] ?? '';

test('fees that keep failing show one retrying notice directly above the margin; loaded fees show none', () => {
  expect(render()).not.toContain('role="alert"');
  h.locationFailed = true;
  const html = render();
  const notice = html.indexOf('role="alert"');
  const sell = html.indexOf('>Sell · Jita<');
  const marginTile = html.search(/>(Net|Gross) margin</);
  expect(sell).toBeGreaterThan(-1);
  expect(notice).toBeGreaterThan(sell);
  expect(notice).toBeLessThan(marginTile);
  expect(html).toContain("System fees didn&#x27;t load");
  expect(html).toContain('aria-label="Retry system fees"');
});

test('a fee that counts an unpriced input as nothing turns the fee mark amber; the margin keeps its number', () => {
  h.pricing = priced([34]);
  const html = render();
  expect(feeMark(html)).toContain('text-dps-mid');
  expect(html).toContain('+300.00');
  h.pricing = priced([]);
  expect(feeMark(render())).not.toContain('text-dps-mid');
});

test('a net margin waiting on new fees is marked as updating', () => {
  h.pricing = priced([]);
  const figure = () => /<span[^>]*>\+300\.00<\/span>/.exec(render())?.[0] ?? '';
  expect(figure()).toContain('price-live');
  expect(figure()).not.toContain('price-pending');
  h.feesPending = true;
  expect(render()).toContain('>Net margin<');
  expect(figure()).toContain('price-pending');
});

test('a loss-making margin carries a true minus, the same glyph the wallet journal uses', () => {
  const loss = priced([]);
  h.pricing = { ...loss, net: { ...loss.net, netMargin: -1_250_000, netMarginPct: -12.5 } };
  const html = render();
  expect(html).toMatch(/<span[^>]*>−1\.25M<\/span>/);
  expect(html).not.toContain('-1.25M');
});
