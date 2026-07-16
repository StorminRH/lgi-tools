import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BlueprintStructure } from '../types';
import {
  useBuildCharacter,
  useBuildPlan,
  useBuildSetup,
  useMarketData,
  usePlannerConfig,
} from './planner-contexts';
import { PricingProvider } from './PricingProvider';

vi.mock('@/components/ui/loading-toast', () => ({
  useLoadingToast: () => undefined,
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => [],
}));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: () => ({
    prices: new Map(),
    isPending: () => false,
    refreshing: false,
  }),
}));

vi.mock('@/data/market-history/use-refresh-on-view', () => ({
  useRefreshHistoryOnView: () => ({
    inputs: new Map(),
    refreshing: false,
  }),
}));

vi.mock('../use-build-character-skills', () => ({
  useBuildCharacterSkillLevels: () => null,
}));

vi.mock('../use-resource-read', () => ({
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
  nodeTimeSkills: {},
};

const pendingPricing = new Promise<null>(() => undefined);
const pendingHistory = new Promise<never[]>(() => undefined);
type PricingProviderProps = Parameters<typeof PricingProvider>[0];
const TestPricingProvider = PricingProvider as ComponentType<
  Omit<PricingProviderProps, 'children'> & { children?: ReactNode }
>;

function ContextProbe() {
  const market = useMarketData();
  const config = usePlannerConfig();
  const setup = useBuildSetup();
  const character = useBuildCharacter();
  const plan = useBuildPlan();
  return createElement(
    'output',
    {
      'data-seeded': String(market.seeded),
      'data-runs': String(config.runs),
      'data-location': setup.location === null ? 'none' : 'selected',
      'data-roster': character.buildCharacters?.length ?? -1,
      'data-ledger': plan.ledger.builds.size,
    },
    'contexts-ready',
  );
}

describe('PricingProvider', () => {
  it('delivers the five concern contracts from one provider state', () => {
    const markup = renderToStaticMarkup(
      createElement(
        TestPricingProvider,
        {
          structure: STRUCTURE,
          pricingPromise: pendingPricing,
          historyPromise: pendingHistory,
          initialBuildCharacterId: null,
        },
        createElement(ContextProbe),
      ),
    );

    expect(markup).toContain(
      '<output data-seeded="false" data-runs="1" data-location="none" data-roster="0" data-ledger="0">contexts-ready</output>',
    );
  });
});
