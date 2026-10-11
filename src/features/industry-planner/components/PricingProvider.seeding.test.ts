import type { ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import { assemblePricing } from '../build-pricing';
import type { BlueprintStructure, TypeAdjustedPrice } from '../types';
import type { BuildSetupValue, MarketDataValue } from './planner-contexts';

const h = vi.hoisted(() => ({
  /** What each promise the provider was handed resolves to, once it has. */
  resolved: new Map<PromiseLike<unknown>, unknown>(),
  costBasis: ['marginal', () => {}] as const,
  writes: { applyBuildSystem: async () => ({ status: 'failed' as const }), failureSystemId: null, retryLocation: () => {}, retry: 0, reactionPending: false },
  // A profile that runs the plates in system 7, whose index is known; the product's own system is never read.
  componentFees: {
    sources: {
      siteOf: () => ({ systemId: 7, facilityTaxPct: 1, costBonusPct: 4 }),
      costIndexOf: (systemId: number) => (systemId === 7 ? 0.1 : null),
    },
    failed: false,
    pending: false,
  },
  refresh: { refreshing: false },
}));
const rt = await vi.hoisted(async () =>
  (await import('@/lib/__tests__/hook-runtime')).createHookRuntime({ memoizeCallbacks: true }),
);

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
  use: (promise: PromiseLike<unknown>) => h.resolved.get(promise),
}));
vi.mock('@/components/PreferencesProvider', () => ({ usePreference: () => h.costBasis }));
vi.mock('@/components/ui/loading-toast', () => ({ useLoadingToast: () => undefined }));
vi.mock('@/data/market-prices/use-refresh-on-view', () => ({ useRefreshOnView: () => h.refresh }));
vi.mock('@/data/market-history/use-refresh-on-view', () => ({ useRefreshHistoryOnView: () => undefined }));
vi.mock('@/lib/use-resource-read', () => ({ useResourceRead: () => undefined }));
vi.mock('../use-available-structures', () => ({ useAvailableStructures: () => null }));
vi.mock('./use-planner-location-writes', () => ({ usePlannerLocationWrites: () => h.writes }));
vi.mock('./use-component-fee-sources', () => ({ useComponentFeeSources: () => h.componentFees }));
vi.mock('./use-planner-profile', () => ({
  useProfileFactors: (_structure: unknown, location: { structureFactors: unknown }) => ({
    profiles: [],
    profilesFailed: false,
    refreshProfiles: () => {},
    profile: null,
    setProfileId: () => {},
    plan: null,
    locationPending: false,
    locationFailed: false,
    structureFactors: location.structureFactors,
    skillTimeFactors: null,
  }),
}));

import { PricingProvider } from './PricingProvider';

// A widget from 5 plates a run; the plates take 7 Tritanium a run and come 10 to a run.
const STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 1000,
  activityId: 1,
  product: { typeId: 999, name: 'Widget', quantityPerRun: 1, renderable: false },
  tree: [
    {
      typeId: 500,
      quantity: 5,
      producedBy: { blueprintTypeId: 1500, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 34, quantity: 7, inputs: [] }],
    },
  ],
  buildTree: [
    { typeId: 999, quantity: 1, inputs: [{ typeId: 500, quantity: 5, inputs: [{ typeId: 34, quantity: 7, inputs: [] }] }] },
  ],
  buildNodeDisplay: {},
  rootHeight: 2,
  materialCategory: {},
  materialCategories: [],
  materialNames: {},
  topJobSeconds: null,
  nodeJobSeconds: {},
  nodeActivityByBlueprint: { 1500: 1 },
  nodeFilterIds: {},
  nodeTimeSkills: {},
};

type ProviderTree = ReactElement<{
  marketData: MarketDataValue;
  buildSetup: BuildSetupValue;
  children: ReactNode[];
}>;
type SeederElement = ReactElement<{ promise: Promise<unknown> }, (props: { promise: Promise<unknown> }) => null>;

/** One provider render, then each seeder whose promise has resolved, as React draws them inside their Suspense. */
function renderProvider(props: Parameters<typeof PricingProvider>[0]): ProviderTree {
  const tree = rt.render(PricingProvider, props) as ProviderTree;
  for (const boundary of tree.props.children.slice(1) as ReactElement<{ children: SeederElement }>[]) {
    const seeder = boundary.props.children;
    if (h.resolved.has(seeder.props.promise)) seeder.type(seeder.props);
  }
  return tree;
}

test('the build is charged on the seeded adjusted prices before any system cost index is read', async () => {
  const pricingPromise = Promise.resolve(assemblePricing(STRUCTURE, () => undefined, { basis: 'marginal' }));
  const historyPromise = new Promise<never[]>(() => undefined);
  const adjustedPricesPromise = Promise.resolve<TypeAdjustedPrice[]>([
    { typeId: 34, adjustedPrice: 5 },
    { typeId: 500, adjustedPrice: 40 },
  ]);
  const props = { structure: STRUCTURE, pricingPromise, historyPromise, adjustedPricesPromise, children: null };
  h.resolved.set(pricingPromise, await pricingPromise);

  renderProvider(props);
  await settle();
  renderProvider(props);
  await settle();
  let tree = renderProvider(props);
  // Priced, with the plates' fee counted, but the prices to value it on are still streaming.
  let net = tree.props.marketData.pricing!.net!;
  expect(tree.props.buildSetup.location).toBeNull();
  expect(tree.props.buildSetup.feesPending).toBe(true);
  expect(net.componentJobs!.jobs[0]!.fee.missingAdjustedPriceTypeIds).toEqual([34]);

  h.resolved.set(adjustedPricesPromise, await adjustedPricesPromise);
  renderProvider(props);
  await settle();
  renderProvider(props);
  await settle();
  tree = renderProvider(props);
  net = tree.props.marketData.pricing!.net!;
  // Half a run of plates: 3.5 Tritanium at 5 is 17.5; at 10% less 4%, 1% tax and 4% SCC.
  expect(tree.props.buildSetup.location).toBeNull();
  expect(tree.props.buildSetup.feesPending).toBe(false);
  expect(net.componentJobs!.jobs[0]!.fee).toMatchObject({ estimatedItemValue: 17.5, missingAdjustedPriceTypeIds: [] });
  expect(net.componentJobs!.total).toBeCloseTo(1.68 + 0.175 + 0.7, 9);
  // The widget's own job is valued on the plates too, and waits only on its system's index.
  expect(net.jobFee).toMatchObject({ estimatedItemValue: 200, missingAdjustedPriceTypeIds: [], jobGrossCost: null });
});
