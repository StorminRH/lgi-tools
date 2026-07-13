## Industry Planner
<!-- updated: 2026-06-30 -->

The Industry Planner is where the earlier architecture stops being abstract.

A blueprint planner sounds simple from the outside: pick an item, see what it takes to build, compare the input cost to the sell price, and decide whether the build is worth doing. In EVE, that is not a flat problem. A blueprint can produce one item or many. It can require components that are also built from other blueprints. Those components can require reactions. Reactions produce batches. Manufacturing blueprints can have material efficiency and time efficiency. Market prices are live. Job fees depend on a system’s industry index. Structures can change material, time, and cost. A signed-in player may already own blueprints, materials, and build locations.

That is a lot of ways for one number to become dishonest.

The first version of the planner in [PR #44](https://github.com/StorminRH/lgi-tools/pull/44) deliberately split the feature into two halves. The stable blueprint structure comes from the SDE and renders as the page’s static shell. The price-dependent view streams in separately. The route starts the price and market-history work, but it does not make the structure wait for those reads. That matters because the shape of a blueprint is game reference data, while the margin is a live estimate. If those are coupled too tightly, a slow price read can make the whole planner feel broken even though the build tree is already known.<sup><a href="#code-industry-page">1</a></sup>

The feature layer is the only place allowed to compose the slices. The SDE slice owns blueprint trees and type labels. The market-price slice owns stored Jita prices and live refresh. The industry-index slice owns cost indices and adjusted prices. The pure math slice owns profitability and fee formulas. The planner sits above those boundaries and joins them into a page. That is an important AI rail: do not let the data slices import each other just because one feature needs their combined answer.<sup><a href="#code-industry-structure">2</a></sup>

`getBlueprintStructure` is the stable half. It loads the blueprint output, the materialized tree, every type label needed for display, activity IDs, and job times. It then converts the SDE tree into the planner’s build tree and display map. That read is cached with the SDE structure tag because it should change when the SDE pipeline changes, not when a user opens the page. This is why the page can show the product, the build stages, and the raw-material categories before any price work finishes.<sup><a href="#code-industry-structure">2</a></sup>

The first major mistake was cost basis.

The early planner could produce a correct-looking answer for simple T1 items and still be badly wrong for deep builds. The bug showed up on Tech III cruisers and capitals. The planner was effectively rounding production at the wrong place in the graph, so a small need for an intermediate could pull the cost of an entire batch, and that overbuild compounded as the tree got deeper. [PR #46](https://github.com/StorminRH/lgi-tools/pull/46) changed the rule. The SDE resolver can keep a marginal tree for structure and validation, but the planner’s cost basis has to be re-derived as a batch ledger: aggregate demand, round buildable jobs to whole runs at the correct level, and carry one ledger forward for both raw-material cost and the build-plan display.<sup><a href="#code-industry-batch-ledger">3</a></sup>

That fix became a pattern. The app should not have one set of quantities in the cost panel and another set in the build plan. The batch ledger is the shared source for the raw totals and the buildable run counts. Later, when owned material efficiency and structure bonuses arrived, they were added to the same walk instead of creating a second costing path. The comments in that file are longer than usual because this is exactly the kind of bug AI can reintroduce if the rule is only implied.<sup><a href="#code-industry-batch-ledger">3</a></sup>

The price side has the same rail. `getBlueprintPricing` does one batched price lookup across the raw materials, the product, and buildable intermediates. Raw materials are the cost basis. The product price drives revenue. Intermediate prices are carried only as a confidence/readout side-channel, not folded into the cost basis. Then everything goes through `assemblePricing`, the same pure assembly function the client uses after live prices refresh. The streamed seed and the refreshed result are not two formulas that happen to agree; they are the same formula with newer inputs.<sup><a href="#code-industry-pricing-query">4</a></sup><sup><a href="#code-industry-assembler">5</a></sup>

[PR #62](https://github.com/StorminRH/lgi-tools/pull/62) changed the user-facing price model. Opening a blueprint now re-confirms the relevant prices live through the shared refresh-on-view engine. The page starts with the durable last-known seed, then the provider refreshes raw materials, the product, and intermediates as one set. As batches return, the provider merges live rows over the seed and recomputes the full pricing snapshot. The user sees a number immediately, but the UI marks that number as something being confirmed, not as a fresh truth just because it painted.<sup><a href="#code-industry-provider-refresh">6</a></sup>

The provider is the planner’s state hub. It owns run count, selected build system, optional station, selected structure, market history, owned blueprint data, owned assets, manual ME/TE overrides, the ME-aware ledger, and build-time totals. That sounds like too much state, but the alternative is worse: each component inventing its own idea of the plan. The provider keeps those inputs in one place and recomputes through the same assembler when any of them changes.<sup><a href="#code-industry-provider-core">7</a></sup>

[PR #105](https://github.com/StorminRH/lgi-tools/pull/105) moved the planner from gross material margin toward net margin. The important design decision was that net margin should be an overlay, not a rewrite of gross margin. The fee math lives in a pure dependency-free leaf. The planner fetches build-location data only when the user picks a system: stations, the system’s manufacturing and reaction indices, and the adjusted prices for the blueprint’s direct base materials. The net path preserves nulls instead of pretending unknowns are zero. A missing cost index means the job fee total is unknown, but facility tax and SCC surcharge can still be shown. A missing adjusted price is flagged, not silently dropped.<sup><a href="#code-industry-build-location">8</a></sup><sup><a href="#code-industry-fees">9</a></sup>

Runs created another boundary. Runs scale output units, raw-material demand, fees, and margin. They do not change what the blueprint is. The run control lives in the cockpit UI and flows back through the provider. That same row also exposes the top blueprint’s ME and TE fields when the job is manufacturing. The UI is allowed to be interactive; the calculation still has to pass through the same central state and assembly path.<sup><a href="#code-industry-cockpit">10</a></sup>

Owned blueprints were the next hard layer. [PR #171](https://github.com/StorminRH/lgi-tools/pull/171) made the planner understand the blueprints a signed-in player owns. That data cannot live in the static server seed because it is per-user and comes from authenticated ESI reads. The provider fetches it once on blueprint open, derives a material-efficiency map for the cost path, and keeps the owner/location/time-efficiency detail on a separate readout channel. ME changes cost. TE changes time. Owner and location explain the source. Those are related, but they are not the same input.<sup><a href="#code-industry-provider-overlays">11</a></sup><sup><a href="#code-industry-batch-ledger">3</a></sup>

That separation matters because EVE’s ME rounding is not a simple multiplier slapped on the final total. The ME-aware ledger has to aggregate demand topologically before applying each buildable blueprint’s material efficiency and propagating its adjusted inputs downward. TE is deliberately separate from the cost path and feeds build-time calculation instead. This is one of the places where I had to direct the architecture away from a tempting simplification: “efficiency” is not one knob. ME, TE, job fees, and structure bonuses touch different parts of the calculation.<sup><a href="#code-industry-provider-derived">12</a></sup>

[PR #173](https://github.com/StorminRH/lgi-tools/pull/173) added owned assets. That overlay answers a different question: not “what does this build cost from an empty hangar?” but “how much of this do I already have?” The owned-asset map fills the quantity rings and ledgers, but it never enters the cost compute. That is intentional. Owned inventory changes acquisition planning; it does not change the market value of the build. If the UI wants a later “cash still needed” mode, that should be a new explicit mode, not a hidden mutation of build cost.<sup><a href="#code-industry-provider-overlays">11</a></sup>

[PR #178](https://github.com/StorminRH/lgi-tools/pull/178) added corporation structures as build locations, and that made the location model more realistic. A structure is not just a label beside a system. Its type and fitted rigs can reduce material, time, and job cost. The planner maps one selected structure into per-node factors based on each node’s activity. Manufacturing material bonuses apply to manufacturing nodes; reactions do not get manufacturing ME just because they live in the same tree. Time bonuses are activity-specific. Job-cost reduction applies to the top manufacturing job’s net-fee path. The structure code is pure because it needs to be trusted before it is allowed to touch the central planner numbers.<sup><a href="#code-industry-structure-factors">13</a></sup>

The corporation-sharing part also reinforced a privacy rule that shows up elsewhere in the app. Corporation structures are useful to all members, but they are not safe to pull just because one character loads a planner page. Sharing defaults off. A Station Manager has to opt the corporation in, and turning sharing off wipes the stored structure catalogue and recorded rigs. Only after that consent gate do shared structures become build locations in the planner. That is the right place for the feature to be opinionated: convenience should not accidentally expose corporation infrastructure.

The current planner UI is the result of all those layers. It opens with a cockpit-style page: product identity, run controls, ME/TE controls, build-location selector, KPI tiles, and a consolidated build plan. The UI changed several times, but the underlying rule stayed stable: the page can show many views, but they all read the same structure, the same pricing snapshot, the same ledger, and the same overlays.<sup><a href="#code-industry-cockpit">10</a></sup>

This is why the Industry Planner became the stress test for LGI.tools. It crosses almost every boundary in the repo: SDE data, ESI prices, daily industry indices, cached static structure, live refresh, authenticated player data, corporation data, and pure math. The feature only stays understandable because each layer has a job.

The planner’s lesson is the same one I keep coming back to: do not let a useful number hide its assumptions. Gross margin is not net margin. Market price is not adjusted price. Owned assets are not reduced cost. ME is not TE. A structure’s security and rigs matter. A fallback price is not the same as an ESI price. When those distinctions are visible in the code, AI can help build the surface without quietly flattening the domain.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-industry-page" file="src/app/industry/[id]/page.tsx" lines="56-63,70-98" lang="tsx" -->
```tsx
// The structure read is cached 'max', so the tree + hero chrome paint fast.
// The price read is started here but NOT awaited — the promise is handed to
// PricingProvider, which resolves it in its own isolated Suspense and fans the
// prices out while the build structure never waits on them.
async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number.parseInt(rawId, 10);

  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();

  const pricingPromise = getBlueprintPricing(id);
  const historyPromise = getMarketHistoryInputs([structure.product.typeId]);

  return (
    <PricingProvider
      structure={structure}
      pricingPromise={pricingPromise}
      historyPromise={historyPromise}
    >
      <CockpitPlanner structure={structure} />
    </PricingProvider>
  );
}
```

<!-- uth:code id="code-industry-structure" file="src/features/industry-planner/queries.ts" lines="38-41,86-99,107-168" lang="ts" -->
```ts
// The industry-planner feature is the composition layer that sits ABOVE the
// eve-data, market-prices, and industry-math data slices — the one place
// allowed to join them. The pure margin math lives in industry-math; everything
// here is glue + caching.

export async function getBlueprintStructure(
  blueprintId: number,
): Promise<BlueprintStructure | null> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  return withColdStartRetry(async () => {
    const chosen = await getBlueprintOutput(blueprintId);
    if (!chosen) return null;

    const treeResult = await getBlueprintTree(blueprintId);
    const tree = treeResult?.treeJson ?? [];
    const rawTypeIds = collectRawTypeIds(tree);
    const labelIds = dedupe([chosen.productTypeId, ...collectTreeTypeIds(tree)]);
    const blueprintIds = collectBlueprintIds(tree);

    const [labels, activityByBlueprint, activityTimeMap] = await Promise.all([
      getTypeLabels(labelIds),
      getActivityByBlueprint([...blueprintIds]),
      getBlueprintActivityTimes([blueprintId, ...blueprintIds]),
    ]);

    const { buildTree, buildNodeDisplay, rootHeight } = toBuildTree({
      tree,
      labels,
      heights: computeHeights(tree),
      activityByBlueprint,
      product: {
        typeId: chosen.productTypeId,
        quantityPerRun: chosen.quantity,
        activityId: chosen.activityId,
      },
    });

    return { blueprintTypeId: blueprintId, activityId: chosen.activityId, tree, buildTree, buildNodeDisplay, rootHeight };
  });
}
```

<!-- uth:code id="code-industry-batch-ledger" file="src/features/industry-planner/build-batch.ts" lines="5-15,67-85,88-128,173-188,208-260" lang="ts" -->
```ts
// Whole-run raw-material totals — the cost basis for the planner.
// What a player must actually BUY to build the target from an empty hangar:
// you can't run 1.68 of a reaction, you run 2. Demand is summed across all
// parents before the ceil, so a shared sub-component is counted once.

export interface BatchLedger {
  raws: Map<number, number>;
  builds: Map<number, { runs: number; batch: number; me: number; blueprintTypeId: number }>;
}

export function computeBatchLedger(tree: TreeNode[], requestedRuns = 1): BatchLedger {
  const recipes = flattenRecipes(tree);
  const ledger = new Map<number, { required: number; runs: number }>();
  const raws = new Map<number, number>();

  const walk = (typeId: number, qtyNeeded: number) => {
    const recipe = recipes.get(typeId);
    if (!recipe) {
      raws.set(typeId, (raws.get(typeId) ?? 0) + qtyNeeded);
      return;
    }
    let entry = ledger.get(typeId) ?? { required: 0, runs: 0 };
    ledger.set(typeId, entry);
    const prevRuns = entry.runs;
    entry.required += qtyNeeded;
    entry.runs = recipe.batch > 0 ? Math.ceil(entry.required / recipe.batch) : 0;
    const additionalRuns = entry.runs - prevRuns;
    if (additionalRuns > 0) {
      for (const input of recipe.inputs) walk(input.typeId, additionalRuns * input.qty);
    }
  };

  for (const node of tree) walk(node.typeId, node.quantity * requestedRuns);
  return { raws, builds };
}

function meAdjust(qty: number, runs: number, me: number, structureMult = 1): number {
  const meMult = me > 0 ? 1 - me / 100 : 1;
  const mult = meMult * structureMult;
  if (mult >= 1) return qty * runs;
  return Math.max(runs, Math.ceil(roundTo2(qty * runs * mult)));
}

export function computeBatchLedgerWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): BatchLedger {
  // ME-aware: aggregate demand first, then apply each buildable's ME once over
  // its final run total before propagating adjusted inputs downward.
}
```

<!-- uth:code id="code-industry-pricing-query" file="src/features/industry-planner/queries.ts" lines="171-219" lang="ts" -->
```ts
export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG, BLUEPRINT_STRUCTURE_TAG);

  const structure = await getBlueprintStructure(blueprintId);
  if (!structure) return null;

  const priceIds = dedupe([
    ...collectRawTypeIds(structure.tree),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ]);
  const priceMap = await getPrices(priceIds);

  return assemblePricing(structure, (typeId): PriceLite | undefined => {
    const p = priceMap.get(typeId);
    if (!p) return undefined;
    return {
      bestBuy: p.bestBuy,
      bestSell: p.bestSell,
      pct5Buy: p.pct5Buy,
      pct5Sell: p.pct5Sell,
      buyVolume: p.buyVolume === null ? null : Number(p.buyVolume),
      sellVolume: p.sellVolume === null ? null : Number(p.sellVolume),
      buyDepth: p.buyDepth,
      sellDepth: p.sellDepth,
      source: p.source,
      staleAfterMs: p.staleAfter.getTime(),
    };
  });
}
```

<!-- uth:code id="code-industry-assembler" file="src/features/industry-planner/build-pricing.ts" lines="22-26,106-132,174-275" lang="ts" -->
```ts
// One assembly path: the server query builds it from the DB price snapshot, and
// the client rebuilds it from live on-demand prices after a refresh. Same inputs
// → same margin, no drift between them.

export interface AssembleOptions {
  runs?: number;
  fee?: {
    adjustedPriceOf: AdjustedPriceOf;
    systemCostIndex: number | null;
    structureCostBonusPct?: number;
  };
  meOf?: (blueprintTypeId: number) => number | undefined;
  structureMeFactorOf?: (blueprintTypeId: number) => number;
}

export function assemblePricing(
  structure: BlueprintStructure,
  priceOf: PriceLiteOf,
  opts: AssembleOptions = {},
): BlueprintPricing {
  const runs = opts.runs ?? 1;
  const materials =
    opts.meOf || opts.structureMeFactorOf
      ? computeBatchMaterialsWithMe(structure.tree, runs, {
          meOf: opts.meOf ?? (() => undefined),
          topBlueprintTypeId: structure.blueprintTypeId,
          structureMeFactorOf: opts.structureMeFactorOf,
        })
      : computeBatchMaterials(structure.tree, runs);

  const buildCost = computeBuildCost(materials, buyOf);
  const outputUnits = structure.product.quantityPerRun * runs;
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: outputUnits,
  });

  return {
    rows,
    intermediatePrices,
    product,
    summary: { inputCost: buildCost.total, revenue: margin.revenue, margin: margin.margin },
    net: computeNet(structure, opts.fee, runs, buildCost.total, productPrice?.bestSell ?? null, outputUnits),
  };
}
```

<!-- uth:code id="code-industry-build-location" file="src/features/industry-planner/queries.ts" lines="19-24,25-51" lang="ts" -->
```ts
// Per-pick build-location read: the system's industry stations + both relevant
// cost indices + the CCP adjusted prices for THIS blueprint's direct ME0 base
// materials. The join lives here, in the feature layer, never inside a data slice.
export async function getBuildLocation(
  systemId: number,
  blueprintId: number,
): Promise<BuildLocationData> {
  const structure = await getBlueprintStructure(blueprintId);
  const baseTypeIds = dedupe(
    structure?.buildTree[0]?.inputs.map((i) => i.typeId) ?? [],
  );

  const [stations, costIndices, adjustedMap] = await Promise.all([
    getIndustryStationsForSystem(systemId),
    getSystemCostIndices(systemId),
    getAdjustedPrices(baseTypeIds),
  ]);

  return {
    stations,
    costIndices: {
      manufacturing: costIndices.get('manufacturing') ?? null,
      reaction: costIndices.get('reaction') ?? null,
    },
    adjustedPrices: [...adjustedMap.entries()].map(([typeId, adjustedPrice]) => ({ typeId, adjustedPrice })),
  };
}
```

<!-- uth:code id="code-industry-fees" file="src/data/industry-math/fees.ts" lines="15-21,84-124,169-212" lang="ts" -->
```ts
// Null-propagation honesty: a missing input is FLAGGED, never silently zeroed;
// a value we genuinely don't know is null, while values we do know stay visible.

export function computeJobInstallationFee(
  baseMaterials: MaterialQty[],
  adjustedPriceOf: AdjustedPriceOf,
  systemCostIndex: number | null,
  rates: FeeRates = DEFAULT_FEE_RATES,
  structureCostBonusPct = 0,
): JobInstallationFee {
  const missingAdjustedPriceTypeIds: number[] = [];
  let estimatedItemValue = 0;

  for (const m of baseMaterials) {
    const adjusted = adjustedPriceOf(m.typeId);
    if (adjusted === null) {
      missingAdjustedPriceTypeIds.push(m.typeId);
      continue;
    }
    estimatedItemValue += adjusted * m.quantity;
  }

  const facilityTax = estimatedItemValue * rates.facilityTax;
  const sccSurcharge = estimatedItemValue * rates.sccSurcharge;
  const missingSystemCostIndex = systemCostIndex === null;
  const jobGrossCost = missingSystemCostIndex
    ? null
    : estimatedItemValue * systemCostIndex * (1 - structureCostBonusPct / 100);
  const total = jobGrossCost === null ? null : jobGrossCost + facilityTax + sccSurcharge;

  return { estimatedItemValue, jobGrossCost, facilityTax, sccSurcharge, total, missingAdjustedPriceTypeIds, missingSystemCostIndex };
}

export function computeNetMargin(input: NetMarginInput): NetMargin {
  const gross = computeMargin(input);
  const jobFee = computeJobInstallationFee(input.baseMaterials, input.adjustedPriceOf, input.systemCostIndex, rates, input.structureCostBonusPct ?? 0);
  const sellSide = computeSellSideFees(gross.revenue, rates);
  const netCost = jobFee.total === null ? null : input.buildCost + jobFee.total;
  const netMargin = gross.revenue === null || sellSide.total === null || netCost === null
    ? null
    : gross.revenue - sellSide.total - netCost;
  return { revenue: gross.revenue, buildCost: input.buildCost, grossMargin: gross.margin, jobFee, sellSide, netCost, netMargin, incomplete };
}
```

<!-- uth:code id="code-industry-provider-core" file="src/features/industry-planner/components/PricingProvider.tsx" lines="58-66,120-143,145-224" lang="tsx" -->
```tsx
// The planner's single live-pricing store. Prices arrive via an un-awaited
// promise the server hands down, so the cascade structure never waits on price.

export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  seeded: boolean;
  refreshing: boolean;
  runs: number;
  setRuns: (runs: number) => void;
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation | null) => void;
  availableStructures: AvailableStructure[] | null;
  selectedStructure: AvailableStructure | null;
  structureFactors: StructureFactors;
  ownedMe: Map<number, number> | null;
  ownedDetail: Map<number, OwnedComponentDetail> | null;
  ownedAssets: Map<number, OwnedAssetEntry> | null;
  meOverrides: Map<number, number>;
  teOverrides: Map<number, number>;
  ledger: BatchLedger;
  buildTimes: BuildTimes;
}
```

<!-- uth:code id="code-industry-provider-refresh" file="src/features/industry-planner/components/PricingProvider.tsx" lines="99-134,214-249" lang="tsx" -->
```tsx
const assemble = useCallback(() => {
  const lookup = (typeId: number): PriceLite | undefined =>
    liveRef.current.get(typeId) ?? seedMapRef.current.get(typeId);
  const loc = locationRef.current;
  const sf = structureFactorsRef.current;
  const fee = loc
    ? {
        adjustedPriceOf: (id: number) => loc.adjustedPrices.get(id) ?? null,
        systemCostIndex: loc.costIndices.manufacturing ?? null,
        structureCostBonusPct: sf.structureCostBonusPct,
      }
    : undefined;

  const owned = ownedMeRef.current;
  const overrides = meOverridesRef.current;
  const meOf = owned || overrides.size ? effectiveMeOf(owned, overrides) : undefined;

  setPricing(assemblePricing(structure, lookup, {
    runs: runsRef.current,
    fee,
    meOf,
    structureMeFactorOf: sf.active ? sf.structureMeFactorOf : undefined,
  }));
}, [structure]);

const toRefresh = useMemo(
  () => [...new Set<number>([
    ...collectRawTypeIds(structure.tree),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ])],
  [structure],
);

const { refreshing } = useRefreshOnView(toRefresh, {
  enabled: seeded && !!pricing,
  onBatch,
});
```

<!-- uth:code id="code-industry-provider-overlays" file="src/features/industry-planner/components/PricingProvider.tsx" lines="32-37,69-76,96-108" lang="tsx" -->
```tsx
// Owned-blueprint ME overlay: fetch the caller's owned ME for this build's
// blueprints once on open. Per-user data can't live in the static seed.
useEffect(() => {
  const blueprintTypeIds = collectBlueprintTypeIds(structure.tree, structure.blueprintTypeId);
  apiFetch(ownedBlueprintsEndpoint, { body: { blueprintTypeIds }, cache: 'no-store' })
    .then((res) => {
      if (!res.ok) return;
      setOwnedMe(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, b.me])));
      setOwnedDetail(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, {
        te: b.te,
        ownerType: b.ownerType,
        ownerName: b.ownerName,
        locationName: b.locationName,
        locationFlag: b.locationFlag,
      }])));
    })
    .catch(() => {});
}, [structure]);

// Owned-asset overlay: on-hand quantity + holdings for every material/product.
// Never read by the cost compute.
useEffect(() => {
  apiFetch(ownedAssetsEndpoint, { body: { typeIds: toRefresh }, cache: 'no-store' })
    .then((res) => {
      if (res.ok) setOwnedAssets(new Map(res.data.assets.map((a) => [a.typeId, a])));
    })
    .catch(() => {});
}, [structure, toRefresh]);
```

<!-- uth:code id="code-industry-provider-derived" file="src/features/industry-planner/components/PricingProvider.tsx" lines="178-211" lang="tsx" -->
```tsx
const ledger = useMemo<BatchLedger>(
  () =>
    computeBatchLedgerWithMe(structure.tree, runs, {
      meOf: effectiveMeOf(ownedMe, meOverrides),
      topBlueprintTypeId: structure.blueprintTypeId,
      structureMeFactorOf: structureFactors.structureMeFactorOf,
    }),
  [structure.tree, structure.blueprintTypeId, runs, ownedMe, meOverrides, structureFactors],
);

// TE-adjusted build-time figures. Its own memo, separate from cost — TE never
// enters the cost path. Reads the shared ME ledger for per-node batched runs.
const buildTimes = useMemo<BuildTimes>(
  () =>
    computeBuildTimes({
      topBlueprintTypeId: structure.blueprintTypeId,
      topProductTypeId: structure.product.typeId,
      topJobSeconds: structure.topJobSeconds,
      nodeJobSeconds: structure.nodeJobSeconds,
      runs,
      builds: ledger.builds,
      teOf: effectiveTeOf(ownedTe, teOverrides),
      structureTeFactorOf: structureFactors.structureTeFactorOf,
    }),
  [structure, runs, ledger, ownedTe, teOverrides, structureFactors],
);
```

<!-- uth:code id="code-industry-structure-factors" file="src/features/industry-planner/structure-factors.ts" lines="3-18,85-120" lang="ts" -->
```ts
// Maps the single selected build structure onto the per-node engine factors.
// The model is role-agnostic: one selected structure bonuses each build node by
// THAT node's activity. The security a rig scales against is the structure's own
// system (corp structure) or the planner's selected build location (custom).

export function structureFactorsFor(args: {
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint } = args;
  const manufacturingBonus = bonusFor(selectedStructure, MANUFACTURING_ACTIVITY, locationSecurity);
  const reactionBonus = bonusFor(selectedStructure, REACTION_ACTIVITY, locationSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}
```

<!-- uth:code id="code-industry-cockpit" file="src/features/industry-planner/components/CockpitPlanner.tsx" lines="21-26,51-63,64-144" lang="tsx" -->
```tsx
// The Cockpit planner body reads the live pricing store and lays the product
// economics out as a page head, identity bar, KPI tiles, and build plan.

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const {
    runs,
    setRuns,
    ownedMe,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
  } = usePricing();

  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <>
      <PlannerHead name={structure.product.name} group={group} activity={activityLabel(structure.activityId)} />
      <div className="rounded-md border border-border bg-section px-[18px] py-4">
        <TypeIcon typeId={structure.product.typeId} variant="render" size={52} alt={structure.product.name} />
        {isManufacturing && (
          <>
            <MeField blueprintTypeId={structure.blueprintTypeId} ownedMe={ownedMe} meOverrides={meOverrides} setMeOverride={setMeOverride} resetMeOverride={resetMeOverride} />
            <TeField blueprintTypeId={structure.blueprintTypeId} ownedTe={ownedTe} teOverrides={teOverrides} setTeOverride={setTeOverride} resetTeOverride={resetTeOverride} />
          </>
        )}
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
      </div>
      {isManufacturing && <BuildLocationSelector blueprintId={structure.blueprintTypeId} />}
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
```
<!-- uth:code-excerpts:end -->
