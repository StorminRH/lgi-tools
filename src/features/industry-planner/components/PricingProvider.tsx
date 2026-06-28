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
import { useRefreshHistoryOnView } from '@/data/market-history/use-refresh-on-view';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import { computeMarketScore, type MarketScore } from '@/data/industry-math/market-score';
import { useLoadingToast } from '@/components/ui/loading-toast';
import { apiFetch } from '@/lib/api-client';
import { collectBlueprintTypeIds, collectRawTypeIds } from '../build-batch';
import { ownedBlueprintsEndpoint } from '../api-contract';
import { toMarketScoreInputs } from '../market-score-inputs';
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
  // Depth is product-only: the Market Score reads the product's ladders, so
  // material/intermediate rows leave them null (the live refresh carries depth
  // for every type, but only the product consumes it).
  for (const r of pricing.rows) {
    map.set(r.typeId, {
      bestBuy: r.unitBuy,
      bestSell: r.bestSell,
      pct5Buy: r.pct5Buy,
      pct5Sell: r.pct5Sell,
      buyVolume: r.buyVolume,
      sellVolume: r.sellVolume,
      buyDepth: null,
      sellDepth: null,
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
      buyDepth: null,
      sellDepth: null,
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
    buyDepth: pricing.product.buyDepth,
    sellDepth: pricing.product.sellDepth,
    source: null,
    staleAfterMs: pricing.product.staleAfterMs,
  });
  return map;
}

// A picked build SYSTEM, client-only state (carries a Map, so it never crosses
// the wire). Built by the build-location selector from the chosen system + the
// /api/industry/build-location read. The fee math reads only `adjustedPrices` +
// `costIndices`, so this object changes only when the SYSTEM changes — the
// per-station refinement lives in separate `station` state below, so picking a
// station never churns this object (and never triggers a recompute).
export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;
  // The system's industry-capable NPC stations, for the per-station refinement.
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

// The optional per-station refinement — display + future-score only; the fee
// math is system-driven (flat NPC facility tax, per-system cost index), so the
// station choice never changes the numbers in v1. Separate from SelectedLocation
// so a station pick doesn't re-derive the pricing.
export interface SelectedStation {
  id: number;
  name: string;
}

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  // True once the streamed price read has settled — distinguishes "still
  // loading" (false) from "resolved, but no pricing available" (true +
  // pricing === null), so consumers don't show a perpetual loading state.
  seeded: boolean;
  refreshing: boolean;
  // Runs of the top product to build (default 1). Scales the cost basis, output
  // units, and the EIV base. 3.5.3b's market score reads this from here.
  runs: number;
  setRuns: (runs: number) => void;
  // The picked build system (null = gross-only). 3.5.3b reads this from here.
  location: SelectedLocation | null;
  // Setting a system clears any prior station selection.
  setLocation: (location: SelectedLocation | null) => void;
  // The optional per-station refinement (display/future-score only).
  station: SelectedStation | null;
  setStation: (stationId: number | null, stationName: string | null) => void;
  // History-derived score inputs keyed by type ID (3.5.3a). Seeded from the
  // server (warm) and refreshed on view; the product type is always present
  // once it has stored history. 3.5.3b's Market Score reads this from here.
  marketHistory: Map<number, MarketHistoryInputs>;
  // The product's Market Score (3.5.3b) — the "how sure can I sell this?"
  // liquidity axis beside net margin. Derived client-side from runs (→ output
  // units), the product's history, and its near-touch depth, so it re-scores
  // live as runs change. score === null when no signal is known.
  marketScore: MarketScore;
  // The caller's owned-blueprint ME, keyed by blueprint type id (best owned copy
  // per type). null until the owned-blueprints read settles; empty for a
  // logged-out caller or one owning none of this build's blueprints. The build
  // plan reads it to drive its ME-aware ledger + per-node readouts.
  ownedMe: Map<number, number> | null;
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

// Resolves the streamed history seed (warm score inputs) and hands it to the
// store, then renders nothing — its own <Suspense fallback={null}> so the wait
// never blocks the hero/cascade. Same deferred-setState shape as PricingSeeder.
function HistorySeeder({
  historyPromise,
  onSeed,
}: {
  historyPromise: Promise<MarketHistoryInputs[]>;
  onSeed: (inputs: MarketHistoryInputs[]) => void;
}) {
  const resolved = use(historyPromise);
  useEffect(() => {
    const t = setTimeout(() => onSeed(resolved), 0);
    return () => clearTimeout(t);
  }, [resolved, onSeed]);
  return null;
}

export function PricingProvider({
  structure,
  pricingPromise,
  historyPromise,
  children,
}: {
  structure: BlueprintStructure;
  pricingPromise: Promise<BlueprintPricing | null>;
  historyPromise: Promise<MarketHistoryInputs[]>;
  children: ReactNode;
}) {
  const [pricing, setPricing] = useState<BlueprintPricing | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [marketHistory, setMarketHistory] = useState<Map<number, MarketHistoryInputs>>(
    () => new Map(),
  );
  const [runs, setRunsState] = useState(1);
  const [location, setLocationState] = useState<SelectedLocation | null>(null);
  const [station, setStationState] = useState<SelectedStation | null>(null);
  // The caller's owned-blueprint ME, keyed by blueprint type id (best owned copy
  // per type). null until the owned-blueprints read settles; empty for a
  // logged-out caller or one owning none of this build's blueprints — either way
  // the cost basis falls back to ME0 (the byte-identical gross path).
  const [ownedMe, setOwnedMe] = useState<Map<number, number> | null>(null);
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
  const ownedMeRef = useRef(ownedMe);
  useEffect(() => {
    runsRef.current = runs;
    locationRef.current = location;
    pricingRef.current = pricing;
    ownedMeRef.current = ownedMe;
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
    // Owned-ME overlay: once the owned-blueprints read lands, the cost basis is
    // recomputed at each buildable's owned ME. Absent (null) → ME0 gross basis.
    const owned = ownedMeRef.current;
    const meOf = owned ? (blueprintTypeId: number) => owned.get(blueprintTypeId) : undefined;
    setPricing(assemblePricing(structure, lookup, { runs: runsRef.current, fee, meOf }));
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
    setStationState(null); // a new (or cleared) system invalidates the station pick
  }, []);

  const setStation = useCallback(
    (stationId: number | null, stationName: string | null) => {
      // Station refinement is its own state — not part of `location` — so this
      // never changes the recompute effect's `location` dep.
      setStationState(stationId === null ? null : { id: stationId, name: stationName ?? '' });
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
  const { refreshing } = useRefreshOnView(toRefresh, {
    enabled: seeded && !!pricing,
    onBatch,
  });

  // Surface the planner's on-view price refresh in the sitewide loading toast —
  // one coarse window per blueprint open (not per row).
  useLoadingToast(refreshing);

  // History score inputs: merge the warm server seed and the on-view refresh
  // into one store (newest per type wins). The product type's history is
  // refreshed on view (stale-gated server-side); 3.5.3b's Market Score reads it.
  const mergeHistory = useCallback((items: Iterable<MarketHistoryInputs>) => {
    setMarketHistory((prev) => {
      const next = new Map(prev);
      for (const i of items) next.set(i.typeId, i);
      return next;
    });
  }, []);
  const onHistoryResult = useCallback(
    (map: Map<number, MarketHistoryInputs>) => mergeHistory(map.values()),
    [mergeHistory],
  );
  // On-view history refresh for the product type only — fires when the seed
  // settles, parallel to the price loop and off the margin path.
  useRefreshHistoryOnView([structure.product.typeId], {
    enabled: seeded,
    onResult: onHistoryResult,
  });

  // Owned-blueprint ME overlay (3.7.5.2): fetch the caller's owned ME for this
  // build's blueprints once on open — per-user data can't live in the static
  // seed, so it arrives client-side (the net-margin pattern). The read fires its
  // own stale-gated server-side refresh; we never refetch on a runs/location
  // recompute, so it's one call per blueprint open. Logged-out / owning none of
  // these → empty map → the cost basis stays the ME0 gross basis.
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const blueprintTypeIds = collectBlueprintTypeIds(structure.tree, structure.blueprintTypeId);
    apiFetch(ownedBlueprintsEndpoint, {
      body: { blueprintTypeIds },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (ignore || !res.ok) return;
        setOwnedMe(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, b.me])));
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [structure]);

  // Recompute when runs, location, or the owned-ME overlay changes — independent
  // of the one-shot refresh loop, which never fires onBatch again once it
  // finishes. Reads the latest pricing via a ref (not a dep) so it fires only on
  // a real runs/location/owned-ME change, never on its own setPricing (which
  // would loop). Guarded on a settled non-null seed so it never overwrites the
  // "unavailable" state, and deferred via a 0ms timer so setState isn't called
  // synchronously from the effect body (the Cache-Components-safe shape used by
  // PricingSeeder).
  useEffect(() => {
    if (!seeded || !pricingRef.current) return;
    const t = setTimeout(() => assemble(), 0);
    return () => clearTimeout(t);
  }, [runs, location, ownedMe, seeded, assemble]);

  // The product's Market Score — pure, no fetch. Re-derives when runs change
  // (via output units), when the product's history lands, and when a price/depth
  // refresh updates the product row. Reads depth from the reactive
  // pricing.product (seeded global market data, advanced seed→live by
  // assemble()), and history from the marketHistory store.
  const marketScore = useMemo(
    () =>
      computeMarketScore(
        toMarketScoreInputs({
          outputUnits: structure.product.quantityPerRun * runs,
          history: marketHistory.get(structure.product.typeId) ?? null,
          buyDepth: pricing?.product.buyDepth ?? null,
          sellDepth: pricing?.product.sellDepth ?? null,
        }),
      ),
    [structure, runs, marketHistory, pricing],
  );

  const value = useMemo<PricingContextValue>(
    () => ({
      pricing,
      seeded,
      refreshing,
      runs,
      setRuns,
      location,
      setLocation,
      station,
      setStation,
      marketHistory,
      marketScore,
      ownedMe,
    }),
    [
      pricing,
      seeded,
      refreshing,
      runs,
      setRuns,
      location,
      setLocation,
      station,
      setStation,
      marketHistory,
      marketScore,
      ownedMe,
    ],
  );

  return (
    <PricingContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <PricingSeeder pricingPromise={pricingPromise} onSeed={seed} />
      </Suspense>
      <Suspense fallback={null}>
        <HistorySeeder historyPromise={historyPromise} onSeed={mergeHistory} />
      </Suspense>
    </PricingContext.Provider>
  );
}
