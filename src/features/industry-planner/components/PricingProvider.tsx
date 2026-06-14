'use client';

import {
  createContext,
  Suspense,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useRefreshOnView,
  type RefreshedPrice,
} from '@/data/market-prices/use-refresh-on-view';
import { collectRawTypeIds } from '../build-batch';
import {
  assemblePricing,
  collectIntermediateTypeIds,
  type PriceLite,
} from '../build-pricing';
import type { BlueprintPricing, BlueprintStructure, IndustryStationView } from '../types';

// The planner's single live-pricing store. It owns what `CostPanel` used to:
// the price snapshot seeded from the server, the client clock, and the
// on-demand refresh that tops up stale/missing rows through
// /api/market-prices/refresh. The difference from 3.1.1 is that it's a
// provider, not a panel — the hero margin, every cascade row's confidence
// badge, and the cost ledger all read the same store, so a single streamed
// price read fans out to all of them while the structure stays in the static
// shell. Prices arrive via an un-awaited promise the server hands down (see
// PricingSeeder), so the cascade structure never waits on the price read.

// Live price map seeded from the server snapshot — the priced raw rows, the
// product, and the buildable intermediates (so a refresh recomputes the same
// shape the server produced). Each row carries its row-level stale_after, so
// the client decides staleness and recomputes without re-reading the DB.
function initialMap(pricing: BlueprintPricing): Map<number, PriceLite> {
  const map = new Map<number, PriceLite>();
  for (const r of pricing.rows) {
    map.set(r.typeId, {
      bestBuy: r.unitBuy,
      bestSell: r.bestSell,
      pct5Buy: r.pct5Buy,
      pct5Sell: r.pct5Sell,
      buyVolume: r.buyVolume,
      sellVolume: r.sellVolume,
      source: r.source,
      staleAfterMs: r.staleAfterMs,
    });
  }
  for (const ip of pricing.intermediatePrices) {
    map.set(ip.typeId, {
      bestBuy: ip.bestBuy,
      bestSell: ip.bestSell,
      pct5Buy: ip.pct5Buy,
      pct5Sell: ip.pct5Sell,
      buyVolume: ip.buyVolume,
      sellVolume: ip.sellVolume,
      source: ip.source,
      staleAfterMs: ip.staleAfterMs,
    });
  }
  map.set(pricing.product.typeId, {
    bestBuy: map.get(pricing.product.typeId)?.bestBuy ?? null,
    bestSell: pricing.product.bestSell,
    pct5Buy: null,
    pct5Sell: null,
    buyVolume: null,
    sellVolume: null,
    source: null,
    staleAfterMs: pricing.product.staleAfterMs,
  });
  return map;
}

// A picked build location, client-only state (carries a Map, so it never crosses
// the wire). Built by the build-location selector from the chosen system + the
// /api/industry/build-location read. `stationId`/`stationName` are the optional
// per-station refinement — display + future-score only; the fee math is
// system-driven (flat NPC facility tax, per-system cost index), so the station
// choice never changes the numbers in v1.
export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;
  // The system's industry-capable NPC stations, for the per-station refinement.
  stations: IndustryStationView[];
  stationId: number | null;
  stationName: string | null;
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  // True once the streamed price read has settled — distinguishes "still
  // loading" (false) from "resolved, but no pricing available" (true +
  // pricing === null), so consumers don't show a perpetual loading state.
  seeded: boolean;
  refreshing: boolean;
  // True while a type is awaiting its live confirmation — every viewed type is
  // refreshed on view, so this is the dimmed→flash signal: dim the seed and show
  // the loading badge while pending, then flash to the toned value when it lands.
  isPending: (typeId: number) => boolean;
  // Pending over the cost-basis (raw) rows, for the hero's dimmed→flash margin.
  aggregatePending: boolean;
  // Runs of the top product to build (default 1). Scales the cost basis, output
  // units, and the EIV base. 3.5.3b's market score reads this from here.
  runs: number;
  setRuns: (runs: number) => void;
  // The picked build location (null = gross-only). 3.5.3b reads this from here.
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation | null) => void;
  // Patch the per-station refinement without a refetch.
  setStation: (stationId: number | null, stationName: string | null) => void;
}

const PricingContext = createContext<PricingContextValue | null>(null);

export function usePricing(): PricingContextValue {
  const ctx = useContext(PricingContext);
  if (!ctx) throw new Error('usePricing must be used within a PricingProvider');
  return ctx;
}

// Resolves the streamed pricing promise (the only component that waits on the
// price read) and seeds the store, then renders nothing. Isolated under its own
// <Suspense fallback={null}> so the wait never blocks the hero/cascade.
function PricingSeeder({
  pricingPromise,
  onSeed,
}: {
  pricingPromise: Promise<BlueprintPricing | null>;
  onSeed: (pricing: BlueprintPricing | null) => void;
}) {
  const resolved = use(pricingPromise);
  useEffect(() => {
    // Defer via a 0ms timer so setState isn't called synchronously from the
    // effect body (the established Cache-Components-safe shape). Always reports
    // the result — including null — so the store can settle into an
    // "unavailable" state rather than loading forever.
    const t = setTimeout(() => onSeed(resolved), 0);
    return () => clearTimeout(t);
  }, [resolved, onSeed]);
  return null;
}

export function PricingProvider({
  structure,
  pricingPromise,
  children,
}: {
  structure: BlueprintStructure;
  pricingPromise: Promise<BlueprintPricing | null>;
  children: ReactNode;
}) {
  const [pricing, setPricing] = useState<BlueprintPricing | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [runs, setRunsState] = useState(1);
  const [location, setLocationState] = useState<SelectedLocation | null>(null);
  // The seed price map, captured when the snapshot first lands. Each refresh
  // batch merges over it (refreshed value wins; un-refreshed rows keep their
  // seed) before recomputing margin, so the assembly never drops back to nulls
  // mid-loop.
  const seedMapRef = useRef<Map<number, PriceLite>>(new Map());
  // The latest live refresh batch, persisted past the one-shot refresh loop so a
  // runs/location change AFTER the loop finishes still recomputes over live
  // prices (not the stale seed). Empty until the first batch lands.
  const liveRef = useRef<Map<number, RefreshedPrice>>(new Map());
  // Refs mirror current runs/location/pricing so the single assemble() and the
  // recompute effect read them without making the refresh loop or the effect
  // restart on every change.
  const runsRef = useRef(runs);
  const locationRef = useRef(location);
  const pricingRef = useRef(pricing);
  useEffect(() => {
    runsRef.current = runs;
    locationRef.current = location;
    pricingRef.current = pricing;
  });

  // THE one recompute, used by both the live-price path and the runs/location
  // path, so the streamed figure and every re-derived figure are computed by the
  // same assembler — no drift. Live batch wins over the seed per type; the fee
  // inputs (adjusted prices + the manufacturing cost index) are supplied only
  // when a location is picked, so with no location it's gross-only.
  const assemble = useCallback(() => {
    const lookup = (typeId: number): PriceLite | undefined =>
      liveRef.current.get(typeId) ?? seedMapRef.current.get(typeId);
    const loc = locationRef.current;
    const fee = loc
      ? {
          adjustedPriceOf: (id: number) => loc.adjustedPrices.get(id) ?? null,
          systemCostIndex: loc.costIndices.manufacturing ?? null,
        }
      : undefined;
    setPricing(assemblePricing(structure, lookup, { runs: runsRef.current, fee }));
  }, [structure]);

  // Settle the store from the streamed read. Mark it seeded either way (so a
  // null result reads as "unavailable", not "loading"); only adopt a non-null
  // snapshot, and only the first one — a refresh batch may already have
  // advanced it.
  const seed = useCallback((initial: BlueprintPricing | null) => {
    setSeeded(true);
    if (initial) {
      seedMapRef.current = initialMap(initial);
      setPricing((prev) => prev ?? initial);
    }
  }, []);

  const setRuns = useCallback((n: number) => {
    setRunsState(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }, []);

  const setLocation = useCallback((loc: SelectedLocation | null) => {
    setLocationState(loc);
  }, []);

  const setStation = useCallback(
    (stationId: number | null, stationName: string | null) => {
      setLocationState((prev) => (prev ? { ...prev, stationId, stationName } : prev));
    },
    [],
  );

  // Every viewed price re-confirmed live on view — across the raw cost basis,
  // the product, and the buildable intermediates. We refresh the whole set, not
  // just stale rows: the seed is shown dimmed as the last-known and each row
  // flashes to its confirmed value as the batch lands (the engine's per-item
  // coalescing makes a fresh item cache-hit and flash back near-instantly, so
  // always-refresh stays cheap). Stable across batches — `structure` is a stable
  // prop — so the hook captures it once when the loop fires.
  const toRefresh = useMemo(
    () => [
      ...new Set<number>([
        ...collectRawTypeIds(structure.tree),
        structure.product.typeId,
        ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
      ]),
    ],
    [structure],
  );

  // Recompute the whole snapshot after each batch so margin and every badge
  // update as prices stream in. Persist the batch in liveRef first so a later
  // runs/location change still recomputes over it.
  const onBatch = useCallback(
    (refreshed: Map<number, RefreshedPrice>) => {
      liveRef.current = refreshed;
      assemble();
    },
    [assemble],
  );

  // The shared refresh loop. Gated on `seeded && !!pricing` (a one-shot
  // false→true): it starts once the seed lands and never re-fires, so deep
  // builds (>1 batch) run to completion.
  const { isPending, refreshing } = useRefreshOnView(toRefresh, {
    enabled: seeded && !!pricing,
    onBatch,
  });

  // Recompute when runs or location changes — independent of the one-shot
  // refresh loop, which never fires onBatch again once it finishes. Reads the
  // latest pricing via a ref (not a dep) so it fires only on a real runs/location
  // change, never on its own setPricing (which would loop). Guarded on a settled
  // non-null seed so it never overwrites the "unavailable" state, and deferred
  // via a 0ms timer so setState isn't called synchronously from the effect body
  // (the Cache-Components-safe shape used by PricingSeeder).
  useEffect(() => {
    if (!seeded || !pricingRef.current) return;
    const t = setTimeout(() => assemble(), 0);
    return () => clearTimeout(t);
  }, [runs, location, seeded, assemble]);

  const aggregatePending = useMemo(
    () => (pricing ? pricing.rows.some((r) => isPending(r.typeId)) : refreshing),
    [pricing, isPending, refreshing],
  );

  const value = useMemo<PricingContextValue>(
    () => ({
      pricing,
      seeded,
      refreshing,
      isPending,
      aggregatePending,
      runs,
      setRuns,
      location,
      setLocation,
      setStation,
    }),
    [
      pricing,
      seeded,
      refreshing,
      isPending,
      aggregatePending,
      runs,
      setRuns,
      location,
      setLocation,
      setStation,
    ],
  );

  return (
    <PricingContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <PricingSeeder pricingPromise={pricingPromise} onSeed={seed} />
      </Suspense>
    </PricingContext.Provider>
  );
}
