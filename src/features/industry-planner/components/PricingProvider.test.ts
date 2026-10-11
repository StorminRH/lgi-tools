import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BlueprintStructure } from '../types';
import { useBuildPlan, useBuildSetup, useMarketData, usePlannerConfig } from './planner-contexts';
import { PricingProvider } from './PricingProvider';

vi.mock('@/components/ui/loading-toast', () => ({
  useLoadingToast: () => undefined,
}));

const h = vi.hoisted(() => ({
  useRefreshOnView: vi.fn((_typeIds: number[]) => ({
    prices: new Map(),
    isPending: () => false,
    refreshing: false,
  })),
}));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: h.useRefreshOnView,
}));

vi.mock('@/data/market-history/use-refresh-on-view', () => ({
  useRefreshHistoryOnView: () => undefined,
}));

vi.mock('@/lib/use-resource-read', () => ({
  useResourceRead: () => undefined,
}));

const STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 100,
  activityId: 1,
  product: {
    typeId: 200,
    name: 'Context Contract',
    quantityPerRun: 1,
    renderable: false,
  },
  tree: [],
  buildTree: [],
  buildNodeDisplay: {},
  rootHeight: 0,
  materialCategory: {},
  materialCategories: [],
  materialNames: {},
  topJobSeconds: null,
  nodeJobSeconds: {},
  nodeActivityByBlueprint: {},
  nodeFilterIds: {},
  nodeTimeSkills: {},
};

const pendingPricing = new Promise<null>(() => undefined);
const pendingHistory = new Promise<never[]>(() => undefined);
const pendingAdjustedPrices = new Promise<never[]>(() => undefined);
type PricingProviderProps = Parameters<typeof PricingProvider>[0];
const TestPricingProvider = PricingProvider as ComponentType<
  Omit<PricingProviderProps, 'children'> & { children?: ReactNode }
>;

function ContextProbe() {
  const market = useMarketData();
  const config = usePlannerConfig();
  const setup = useBuildSetup();
  const plan = useBuildPlan();
  return createElement(
    'output',
    {
      'data-seeded': String(market.seeded),
      'data-runs': String(config.runs),
      'data-location': setup.location === null ? 'none' : 'selected',
      'data-profile': setup.profile === null ? 'none' : setup.profile.id,
      'data-skills': String(plan.skillTimeFactors.active),
      'data-ledger': plan.ledger.builds.size,
    },
    'contexts-ready',
  );
}

describe('PricingProvider', () => {
  it('delivers the four concern contracts from one provider state, at baseline without a profile', () => {
    const markup = renderToStaticMarkup(
      createElement(
        TestPricingProvider,
        {
          structure: STRUCTURE,
          pricingPromise: pendingPricing,
          historyPromise: pendingHistory,
          adjustedPricesPromise: pendingAdjustedPrices,
        },
        createElement(ContextProbe),
      ),
    );

    expect(markup).toContain(
      '<output data-seeded="false" data-runs="1" data-location="none" data-profile="none" data-skills="false" data-ledger="0">contexts-ready</output>',
    );
  });

  it('refreshes every type the server prices: raws, the product, then intermediates', () => {
    const structure: BlueprintStructure = {
      ...STRUCTURE,
      tree: [
        {
          typeId: 500,
          quantity: 2,
          producedBy: { blueprintTypeId: 1500, quantityPerRun: 1, runsNeeded: 2 },
          inputs: [{ typeId: 34, quantity: 100, inputs: [] }],
        },
        { typeId: 35, quantity: 50, inputs: [] },
      ],
      buildTree: [
        {
          typeId: 200,
          quantity: 1,
          inputs: [
            { typeId: 500, quantity: 2, inputs: [{ typeId: 34, quantity: 100, inputs: [] }] },
            { typeId: 35, quantity: 50, inputs: [] },
          ],
        },
      ],
      buildNodeDisplay: {
        200: { name: 'Context Contract', height: 2, isRaw: false, label: 'Item', tone: 'teal' },
        500: { name: 'Subassembly', height: 1, isRaw: false, label: 'Component', tone: 'blue' },
        34: { name: 'Tritanium', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
        35: { name: 'Pyerite', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
      },
    };
    renderToStaticMarkup(
      createElement(TestPricingProvider, {
        structure,
        pricingPromise: pendingPricing,
        historyPromise: pendingHistory,
        adjustedPricesPromise: pendingAdjustedPrices,
      }),
    );

    expect(h.useRefreshOnView.mock.lastCall?.[0]).toEqual([34, 35, 200, 500]);
  });
});
