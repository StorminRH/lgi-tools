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
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  useRefreshOnView,
  type RefreshedPrice,
} from '@/data/market-prices/use-refresh-on-view';
import { useRefreshHistoryOnView } from '@/data/market-history/use-refresh-on-view';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import { computeMarketScore, type MarketScore } from '@/data/industry-math/market-score';
import { useLoadingToast } from '@/components/ui/loading-toast';
import { usePreference, usePreferencesReady } from '@/components/PreferencesProvider';
import { resolveBuildCharacter, type BuildCharacter } from '@/components/run-as-state';
import { useAccountCharacters } from '@/components/use-account-characters';
import { apiFetch } from '@/lib/api-client';
import { industryCostBasis, plannerBuildCharacter, plannerBuildLocation } from '@/lib/preferences';
import {
  collectBlueprintTypeIds,
  collectRawTypeIds,
  computeBatchLedgerWithMe,
  type BatchLedger,
  type MeOptions,
} from '../build-batch';
import { clampMe, effectiveMeOf } from '../me-overrides';
import { clampTe, effectiveTeOf } from '../te-overrides';
import type { MarginMode } from '../cockpit-margin';
import type { NetMode } from '../multibuy';
import {
  createBuildSystemApplier,
  type ApplySystemResult,
  type BuildSystemRef,
} from '../build-system-apply';

export type { ApplySystemResult, BuildSystemRef };
import { computeBuildTimes, type BuildTimes } from '../build-time';
import {
  availableStructuresEndpoint,
  buildLocationEndpoint,
  ownedAssetsEndpoint,
  ownedBlueprintsEndpoint,
} from '../api-contract';
import { REACTION_ACTIVITY } from '../structure-bonus';
import { skillTimeFactorsFor, type SkillTimeFactors } from '../skill-time';
import { useBuildCharacterSkillLevels } from '../use-build-character-skills';
import { toMarketScoreInputs } from '../market-score-inputs';
import {
  assemblePricing,
  collectIntermediateTypeIds,
  type PriceLite,
} from '../build-pricing';
import { initialPriceMap } from '../initial-price-map';
import {
  composeFeeInputs,
  hostsReactions,
  structureFactorsFor,
  structureReadouts,
  type StructureFactors,
  type StructureReadout,
} from '../structure-factors';
import type {
  AvailableStructure,
  BlueprintPricing,
  BlueprintStructure,
  IndustryStationView,
  OwnedAssetEntry,
  OwnedComponentDetail,
} from '../types';

// The planner's single live-pricing store. It owns what `CostPanel` used to:
// the price snapshot seeded from the server, the client clock, and the
// on-demand refresh that tops up stale/missing rows through
// /api/market-prices/refresh. The difference from 3.1.1 is that it's a
// provider, not a panel — the hero margin, every cascade row's confidence
// badge, and the cost ledger all read the same store, so a single streamed
// price read fans out to all of them while the structure stays in the static
// shell. Prices arrive via an un-awaited promise the server hands down (see
// PricingSeeder), so the cascade structure never waits on the price read.

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

// Group B's own build system (3.7.12.2) — the reaction gap-filler refinery's system.
// It scales B's reaction rigs AND, for a REACTION blueprint, keys the reaction
// build-location fetch (3.7.13.3 — the #187 dead seam, live): the top reaction job
// fees against THIS system's 'reaction' cost index, held in the provider's separate
// `reactionLocation` state. A corp refinery deduce-locks this from its home system;
// a custom refinery picks it. Kept apart from `location` (A's system) so the two are
// independent.
export interface SelectedReactionSystem {
  systemId: number;
  systemName: string;
  security: number | null;
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
  // The BUILD CHARACTER (ACCOUNT.8) — the compute identity Phase 3's levers
  // read. The skills→time lever (3.7.19.1) is live: the character's trained
  // levels feed skillTimeFactors, which joins ONLY the buildTimes memo — the
  // cost/material paths (assemble(), the ledger) remain untouched. Already
  // validated — the stored preference id is resolved against the linked roster,
  // so an unknown id can never appear here. null = unset ⇒ the frame mirrors
  // the live active character (store-explicit-only) and no levers apply.
  buildCharacter: BuildCharacter | null;
  // True while a stored selection awaits the roster read — the frame shows its
  // loading skeleton instead of flashing the active character's portrait.
  buildCharacterPending: boolean;
  // The account's linked characters (the Run-As menu's rows), read by the
  // shared useAccountCharacters hook keyed on the auth identity — refetches on
  // sign-in / active-character change; a failed read settles empty (fail-open).
  // null until the read settles; empty for a logged-out caller. needsReconnect
  // rows are listed unfiltered — scope health never gates selection (Phase 3
  // decides how missing data degrades).
  buildCharacters: BuildCharacter[] | null;
  // Persists the pick (user_preferences via the preference tier). null clears —
  // the Default row stores null, never the active id, so the mirror stays live.
  setBuildCharacter: (id: number | null) => void;
  // The structures the caller can place this build in (3.7.9.1.4) — their custom
  // structures (and, next session, their corp's), fetched once on open. null until
  // the read settles; empty for a logged-out caller or one with none.
  availableStructures: AvailableStructure[] | null;
  // The single selected build structure (role-agnostic): it bonuses each build node
  // by that node's activity. null clears the selection.
  selectedStructure: AvailableStructure | null;
  setSelectedStructure: (structure: AvailableStructure | null) => void;
  // The derived per-node engine factors + per-activity bonus readout. Re-derives
  // when the selection or the build system's security changes.
  structureFactors: StructureFactors;
  // The selected build character's trained ACTIVE skill levels (3.7.19.1), or
  // null while unset / loading / fail-open — the indicator reads the raw map to
  // name the applied levels.
  buildCharacterSkillLevels: Record<string, number> | null;
  // The derived per-node skills→time factors (identity when levels are null —
  // the all-or-nothing fail-open). Joins ONLY the buildTimes memo; `active`
  // drives the applied indicator + hover copy.
  skillTimeFactors: SkillTimeFactors;
  // The dedicated "react at" refinery (3.7.12.2) + its own system. Always available;
  // the routing derives roles: a lone refinery does the whole chain, and adding a
  // build structure takes over just the manufacturing nodes. Live-only, like the
  // build pick. For a REACTION blueprint the system also drives the reaction
  // build-location fetch (3.7.13.3), so the top reaction job fees against it.
  reactionStructure: AvailableStructure | null;
  setReactionStructure: (structure: AvailableStructure | null) => void;
  reactionSystem: SelectedReactionSystem | null;
  setReactionSystem: (system: SelectedReactionSystem | null) => void;
  // Whether a REACTION blueprint has a fee source (3.7.13.3): the reaction slot's
  // fetched location, or a build-slot refinery with a location picked. Gates the
  // margin tile's Net toggle; always false on a manufacturing blueprint (whose
  // gate is `location !== null`).
  reactionNetAvailable: boolean;
  // Per-slot readout pills — the bonus each slot is actually contributing (a slot shows
  // a pill only for an activity it hosts).
  buildStructureReadout: StructureReadout;
  reactionStructureReadout: StructureReadout;
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
  // The readout detail (TE / owner / location) for each owned component, keyed by
  // blueprint type id — built from the SAME owned-blueprints read, but a separate
  // channel from `ownedMe` so the cost compute is untouched. The orb popover reads
  // it; absent entries (unowned / manual nodes) simply render ME-only.
  ownedDetail: Map<number, OwnedComponentDetail> | null;
  // The caller's owned ASSETS (3.7.7.2), keyed by material/product type id: how many
  // units are on hand + where they sit. null until the owned-assets read settles;
  // empty for a logged-out caller or one owning none of this build's items — either
  // way every QTY ring stays empty and every ledger shows '—'. The build plan reads
  // it to fill each node's ring + asset ledger; never read by the cost compute.
  ownedAssets: Map<number, OwnedAssetEntry> | null;
  // Manual per-node ME overrides (what-if), keyed by blueprint type id. Client-only
  // and NOT persisted — overlaid on `ownedMe` to drive the same `meOf` seam, so the
  // whole plan recomputes through one engine path. Empty by default → byte-identical
  // to the owned-only plan.
  meOverrides: Map<number, number>;
  // Set a node's manual ME (clamped 0–10); `reset` drops it back to owned-or-default.
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
  // The caller's owned-blueprint TE, keyed by blueprint type id — derived from
  // `ownedDetail`, the time-side twin of `ownedMe`. Drives the TE adjuster + the
  // build-time figures. null until the read settles.
  ownedTe: Map<number, number> | null;
  // Manual per-node TE overrides (what-if), keyed by blueprint type id. Client-only,
  // not persisted — overlaid on `ownedTe` for the build-time engine. Empty by default
  // ⇒ "Build time" is identical to the pre-TE figure.
  teOverrides: Map<number, number>;
  // Set a node's manual TE (clamped 0–20); `reset` drops it back to owned-or-default.
  setTeOverride: (blueprintTypeId: number, te: number) => void;
  resetTeOverride: (blueprintTypeId: number) => void;
  // The ME-aware whole-run batch ledger (the build-batch ceil). One source for the
  // build plan's tiers + drill-down AND the build-time totals, so they can't drift.
  ledger: BatchLedger;
  // The exact ME inputs the shared ledger was computed with — exposed so a
  // consumer running its own walk (the multibuy export) can never drift from
  // the ledger on ME/structure factors.
  ledgerMeOpts: MeOptions;
  // The final-job and whole-tree build-time figures, TE-applied (readout only — TE
  // never touches the cost path). Recomputes on runs / ME / TE change.
  buildTimes: BuildTimes;
  // The summary's cost basis — the Raw|Item toggle (3.7.21.1), persisted as the
  // industry.costBasis preference. 'marginal' (Item) is the default; the rows /
  // build plan stay batched regardless (only the KPI summary switches).
  costBasis: 'batched' | 'marginal';
  setCostBasis: (basis: 'batched' | 'marginal') => void;
  // THE single build-system apply seam (3.7.23.1 — moved from the selector so
  // ONE generation counter serializes every caller: the selector's submit, the
  // lock/unlock transitions, the on-mount restore, and a template load; two
  // independent counters would let a slow restore clobber a later apply).
  // Fetches the system's live build data, seeds `location`, and (persist) saves
  // the identifier to the planner.buildLocation preference.
  applyBuildSystem: (sys: BuildSystemRef, opts: { persist: boolean }) => Promise<ApplySystemResult>;
  // Clears the picked system AND the saved preference (the selector's Clear).
  clearBuildLocation: () => void;
  // The saved planner.buildLocation identifier — read by the selector's
  // unlock-restore transition (leaving a locked structure returns to it).
  savedBuildLocation: BuildSystemRef | null;
  // Gross/Net margin view (lifted from CockpitPlanner, 3.7.23.1 — planner-
  // configurable state lives on the provider so saved templates capture it).
  // Net availability stays a render-time gate in the KPI tile.
  marginMode: MarginMode;
  setMarginMode: (mode: MarginMode) => void;
  // The multibuy panel's scope (lifted from MultibuyPanel, 3.7.23.1): the net
  // mode + the UNchecked tier depths (inverted — the default "build everything"
  // is the empty set). The no-owned-stock fallback to Total stays a render-time
  // derivation in the panel.
  multibuyMode: NetMode;
  setMultibuyMode: (mode: NetMode) => void;
  multibuyUncheckedTiers: ReadonlySet<number>;
  setMultibuyUncheckedTiers: (tiers: ReadonlySet<number>) => void;
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

// Shared what-if override setters for ME and TE: `set` clamps + writes a fresh map
// (a new identity so the recompute dep fires); `reset` drops the entry. Same shape,
// only the clamp (the cap) differs between the two.
function useOverrideSetters(
  setOverrides: Dispatch<SetStateAction<Map<number, number>>>,
  clamp: (n: number) => number,
) {
  const set = useCallback(
    (blueprintTypeId: number, value: number) => {
      setOverrides((prev) => new Map(prev).set(blueprintTypeId, clamp(value)));
    },
    [setOverrides, clamp],
  );
  const reset = useCallback(
    (blueprintTypeId: number) => {
      setOverrides((prev) => {
        if (!prev.has(blueprintTypeId)) return prev;
        const next = new Map(prev);
        next.delete(blueprintTypeId);
        return next;
      });
    },
    [setOverrides],
  );
  return { set, reset };
}

export function PricingProvider({
  structure,
  pricingPromise,
  historyPromise,
  initialBuildCharacterId,
  children,
}: {
  structure: BlueprintStructure;
  pricingPromise: Promise<BlueprintPricing | null>;
  historyPromise: Promise<MarketHistoryInputs[]>;
  // The build-character preference's cookie value, read in the page's Suspense
  // hole (the ssrReadable idiom) so a hard reload never flashes the active
  // character while the server preference GET resolves.
  initialBuildCharacterId: number | null;
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
  // The structures the caller can place this build in (3.7.9.1.4), fetched on open
  // (the owned-blueprints pattern), and the single selected structure over them.
  const [availableStructures, setAvailableStructures] = useState<AvailableStructure[] | null>(null);
  const [selectedStructure, setSelectedStructureState] = useState<AvailableStructure | null>(null);
  // The build character (ACCOUNT.8): the persisted preference id + the roster it
  // resolves against. The roster read lives in the shared useAccountCharacters
  // hook, keyed on the auth identity — so a planner mounted signed-out picks the
  // roster up when the session lands, and a failed read settles empty (fail-open)
  // rather than pending forever. The preference value is a primitive, and the
  // resolution is derived IN RENDER (never an effect dep — the .7 identity rule);
  // the resolved character joins no compute path this session (see the context
  // field's doc).
  const [rawBuildCharacterId, setBuildCharacter] = usePreference(plannerBuildCharacter, {
    serverValue: initialBuildCharacterId,
  });
  // The input-cost basis (Raw|Item, 3.7.21.1). Item (marginal) is the fallback;
  // a saved Raw re-assembles after the seed lands (the owned-ME settle class —
  // the shared seed always carries the marginal default).
  const [costBasis, setCostBasis] = usePreference(industryCostBasis);
  // The saved build-system identifier (planner.buildLocation) — provider-owned
  // since 3.7.23.1 alongside applyBuildSystem below (one write seam, one
  // restore). Only the id triple persists; live data is re-fetched on restore.
  const [savedBuildLocation, setSavedBuildLocation] = usePreference(plannerBuildLocation);
  const preferencesReady = usePreferencesReady();
  // Gross/Net margin view + the multibuy panel's scope — lifted here (3.7.23.1)
  // so every planner-configurable lives on the provider (the template rule).
  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const [multibuyMode, setMultibuyMode] = useState<NetMode>('Remaining');
  const [multibuyUncheckedTiers, setMultibuyUncheckedTiersState] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const setMultibuyUncheckedTiers = useCallback((tiers: ReadonlySet<number>) => {
    setMultibuyUncheckedTiersState(new Set(tiers));
  }, []);
  const buildCharacters = useAccountCharacters();
  const { character: buildCharacter, pending: buildCharacterPending } = resolveBuildCharacter(
    rawBuildCharacterId,
    buildCharacters,
  );
  // The selected character's trained levels (3.7.19.1) — query-keyed on the
  // resolved id, fail-open to null (no selection / pending roster / never
  // synced), so the factors below collapse to the identity in every degraded
  // state and the time figures render the no-skill baseline.
  const buildCharacterSkillLevels = useBuildCharacterSkillLevels(
    buildCharacter?.characterId ?? null,
  );
  // The reaction slot's refinery + its own system (security-only). Live-only, reset
  // with the planner. Independent of `location` (the build slot's system).
  const [reactionStructure, setReactionStructure] = useState<AvailableStructure | null>(null);
  const [reactionSystem, setReactionSystem] = useState<SelectedReactionSystem | null>(null);
  const reactionSecurity = reactionSystem?.security ?? null;
  // The REACTION system's fee inputs (3.7.13.3 — the #187 seam live): its 'reaction'
  // cost index + the blueprint's adjusted prices, fetched below for a reaction
  // blueprint once a reaction system is picked. Query-keyed by BOTH the system
  // and the blueprint it was fetched FOR (the sync-setState-free invalidation
  // shape): the state is only ever set from the fetch callback, and
  // `reactionLocation` below derives to null whenever either key stops matching
  // — so an unpick or a blueprint switch needs no effect-body clear, a prior
  // blueprint's adjusted prices can never feed this one's EIV, and the net path
  // stays honestly unavailable until real inputs exist (never a fake zero).
  const [fetchedReactionLocation, setFetchedReactionLocation] = useState<{
    systemId: number;
    blueprintTypeId: number;
    costIndex: number | null;
    adjustedPrices: Map<number, number>;
  } | null>(null);
  const reactionLocation =
    structure.activityId === REACTION_ACTIVITY &&
    fetchedReactionLocation !== null &&
    fetchedReactionLocation.systemId === reactionSystem?.systemId &&
    fetchedReactionLocation.blueprintTypeId === structure.blueprintTypeId
      ? fetchedReactionLocation
      : null;
  // The no-double-select rule holds in STATE, not just in the option lists: picking
  // the reaction slot's refinery as the build structure vacates the reaction slot.
  // (Its dropdown filters that structure out, so leaving the state set would silently
  // keep scaling reaction rigs against the stale slot's system and render an orphaned
  // bonus pill beside a select reading "none".)
  const setSelectedStructure = useCallback(
    (structure: AvailableStructure | null) => {
      setSelectedStructureState(structure);
      if (structure && reactionStructure && reactionStructure.id === structure.id) {
        setReactionStructure(null);
        setReactionSystem(null);
      }
    },
    [reactionStructure],
  );
  // Per-node engine factors derived from the two picks + each one's OWN system security
  // (3.7.9.1.4 / 3.7.12.2). The routing derives roles (a refinery → reactions; a build
  // structure → manufacturing; a lone refinery → the whole chain). NO_STRUCTURE_FACTORS
  // (all no-ops) when nothing is selected, so the plan stays byte-identical.
  const structureFactors = useMemo<StructureFactors>(
    () =>
      structureFactorsFor({
        selectedStructure,
        locationSecurity: location?.security ?? null,
        reactionStructure,
        reactionSecurity,
        nodeActivityByBlueprint: structure.nodeActivityByBlueprint,
      }),
    [selectedStructure, location?.security, reactionStructure, reactionSecurity, structure.nodeActivityByBlueprint],
  );
  // The per-slot readout pills — each slot shows only the bonus for what it hosts.
  const { build: buildStructureReadout, reaction: reactionStructureReadout } = useMemo(
    () => structureReadouts({ selectedStructure, reactionStructure, factors: structureFactors }),
    [selectedStructure, reactionStructure, structureFactors],
  );
  // The caller's owned-blueprint ME, keyed by blueprint type id (best owned copy
  // per type). null until the owned-blueprints read settles; empty for a
  // logged-out caller or one owning none of this build's blueprints — either way
  // the cost basis falls back to ME0 (the byte-identical gross path).
  const [ownedMe, setOwnedMe] = useState<Map<number, number> | null>(null);
  // The owned-component readout detail (TE / owner / location), built from the same
  // read as `ownedMe` but kept on its own channel — the orb popover consumes it; the
  // cost compute never does.
  const [ownedDetail, setOwnedDetail] = useState<Map<number, OwnedComponentDetail> | null>(null);
  // The caller's owned ASSETS (3.7.7.2), keyed by material/product type id: on-hand
  // units + holdings, for the QTY ring + asset ledger. null until the owned-assets
  // read settles; empty for a logged-out caller or one owning none of this build's
  // items — either way every ring stays empty and every ledger shows '—'. Never read
  // by the cost compute.
  const [ownedAssets, setOwnedAssets] = useState<Map<number, OwnedAssetEntry> | null>(null);
  // Manual per-node ME overrides (what-if), keyed by blueprint type id — client-only,
  // never persisted, reset when the planner remounts on a new blueprint (`structure`).
  const [meOverrides, setMeOverrides] = useState<Map<number, number>>(() => new Map());
  // Manual per-node TE overrides (what-if), the time-side twin of `meOverrides`.
  const [teOverrides, setTeOverrides] = useState<Map<number, number>>(() => new Map());
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
  const meOverridesRef = useRef(meOverrides);
  const structureFactorsRef = useRef(structureFactors);
  const selectedStructureRef = useRef(selectedStructure);
  const reactionStructureRef = useRef(reactionStructure);
  const reactionLocationRef = useRef(reactionLocation);
  const costBasisRef = useRef(costBasis);
  useEffect(() => {
    runsRef.current = runs;
    locationRef.current = location;
    pricingRef.current = pricing;
    ownedMeRef.current = ownedMe;
    meOverridesRef.current = meOverrides;
    structureFactorsRef.current = structureFactors;
    selectedStructureRef.current = selectedStructure;
    reactionStructureRef.current = reactionStructure;
    reactionLocationRef.current = reactionLocation;
    costBasisRef.current = costBasis;
  });

  // THE one recompute, used by both the live-price path and the runs/location
  // path, so the streamed figure and every re-derived figure are computed by the
  // same assembler — no drift. Live batch wins over the seed per type; the fee
  // inputs are supplied only when a fee source exists (the build location for
  // manufacturing, the reaction location — or a build-slot refinery — for a
  // reaction blueprint), so with neither it's gross-only.
  const assemble = useCallback(() => {
    const lookup = (typeId: number): PriceLite | undefined =>
      liveRef.current.get(typeId) ?? seedMapRef.current.get(typeId);
    const sf = structureFactorsRef.current;
    // Fee composition (3.7.13.3) — the routing rules (mfg tax reads the BUILD
    // slot only; the reaction fee reads the reaction host with the build-slot-
    // refinery fallback) live in the pure composeFeeInputs, tested beside the
    // rest of the structure routing.
    const fee = composeFeeInputs({
      location: locationRef.current,
      reactionLocation: reactionLocationRef.current,
      buildStructure: selectedStructureRef.current,
      reactionStructure: reactionStructureRef.current,
      structureCostBonusPct: sf.structureCostBonusPct,
    });
    // Owned-ME overlay + manual overrides: the cost basis is recomputed at each
    // buildable's effective ME (a manual override wins, else the owned ME). No owned
    // data and no overrides → meOf stays undefined → ME0 gross basis. With overrides
    // empty it equals the owned-only meOf → byte-identical to the pre-override plan.
    const owned = ownedMeRef.current;
    const overrides = meOverridesRef.current;
    const meOf = owned || overrides.size ? effectiveMeOf(owned, overrides) : undefined;
    setPricing(
      assemblePricing(structure, lookup, {
        runs: runsRef.current,
        fee,
        meOf,
        // The structure material factor composes alongside owned ME; passed only
        // when a structure is active, so the gross seed path stays byte-identical.
        structureMeFactorOf: sf.active ? sf.structureMeFactorOf : undefined,
        // The Raw|Item toggle (3.7.21.1) — switches the summary's cost basis;
        // the rows stay batched inside the assembler.
        basis: costBasisRef.current,
      }),
    );
  }, [structure]);

  // Settle the store from the streamed read. Mark it seeded either way (so a
  // null result reads as "unavailable", not "loading"); only adopt a non-null
  // snapshot, and only the first one — a refresh batch may already have
  // advanced it.
  const seed = useCallback((initial: BlueprintPricing | null) => {
    setSeeded(true);
    if (initial) {
      seedMapRef.current = initialPriceMap(initial);
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

  // Load a system's live build data and seed the store (moved from the
  // selector, 3.7.23.1). The generation/abort guard lives in the pure applier
  // (build-system-apply.ts, tested there); every input here is stable, so ONE
  // instance — one counter — serializes a manual pick, a lock deduce, the mount
  // restore, and a template load (last-request-wins).
  const applyBuildSystem = useMemo(
    () =>
      createBuildSystemApplier({
        fetchLocation: async (systemId, signal) => {
          const res = await apiFetch(buildLocationEndpoint, {
            body: { systemId, blueprintId: structure.blueprintTypeId },
            cache: 'no-store',
            signal,
          });
          return res.ok ? res.data : null;
        },
        onApplied: (sys, data) =>
          setLocation({
            systemId: sys.systemId,
            systemName: sys.systemName,
            security: sys.security,
            stations: data.stations,
            costIndices: data.costIndices,
            adjustedPrices: new Map(data.adjustedPrices.map((a) => [a.typeId, a.adjustedPrice])),
          }),
        onPersist: (sys) => setSavedBuildLocation(sys),
      }),
    [structure.blueprintTypeId, setLocation, setSavedBuildLocation],
  );

  // Clear the pick AND the saved preference — the selector's Clear affordance
  // and a template's saved-null build system both land here.
  const clearBuildLocation = useCallback(() => {
    setLocation(null);
    setSavedBuildLocation(null);
  }, [setLocation, setSavedBuildLocation]);

  // Restore the saved build system once the authoritative preference tier has
  // settled: re-fetch its live data for THIS blueprint and seed the store. Runs
  // once; skipped if something already picked (a manual pick — or a template
  // apply — wins, and the generation guard covers the in-flight overlap).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!preferencesReady || restoredRef.current || location || !savedBuildLocation) return;
    restoredRef.current = true;
    void applyBuildSystem(savedBuildLocation, { persist: false });
  }, [preferencesReady, savedBuildLocation, location, applyBuildSystem]);

  // Manual ME / TE override setters (what-if) — `set` clamps (ME 0–10, TE 0–20),
  // `reset` drops the entry so the node tracks its owned value again.
  const { set: setMeOverride, reset: resetMeOverride } = useOverrideSetters(setMeOverrides, clampMe);
  const { set: setTeOverride, reset: resetTeOverride } = useOverrideSetters(setTeOverrides, clampTe);

  // Owned TE, derived from the readout detail (the time-side twin of `ownedMe`) — one
  // source, no second fetch. null until the owned read settles.
  const ownedTe = useMemo<Map<number, number> | null>(
    () => (ownedDetail ? new Map([...ownedDetail].map(([bp, d]) => [bp, d.te])) : null),
    [ownedDetail],
  );

  // The exact ME inputs of the shared ledger, as one stable object — also handed
  // to consumers that run their own walk off the same tree (the multibuy export),
  // so they can never drift from the ledger on ME/structure factors.
  const ledgerMeOpts = useMemo<MeOptions>(
    () => ({
      meOf: effectiveMeOf(ownedMe, meOverrides),
      topBlueprintTypeId: structure.blueprintTypeId,
      // The selected structure's material factor by node activity (3.7.9.1.3);
      // a no-op (×1) when nothing is selected, so the tiers stay byte-identical.
      structureMeFactorOf: structureFactors.structureMeFactorOf,
    }),
    [structure.blueprintTypeId, ownedMe, meOverrides, structureFactors],
  );

  // The ME-aware batch ledger — computed ONCE here and shared (the build plan reads
  // it from context), so the cost tiers and the build-time totals read one source and
  // can't disagree, and the topological walk runs once per change, not twice.
  const ledger = useMemo<BatchLedger>(
    () => computeBatchLedgerWithMe(structure.tree, runs, ledgerMeOpts),
    [structure.tree, runs, ledgerMeOpts],
  );

  // The selected build character's per-node skills→time factors (3.7.19.1).
  // Identity (×1) when levels are null — the all-or-nothing fail-open — so the
  // time figures stay byte-identical to the no-character baseline.
  const skillTimeFactors = useMemo<SkillTimeFactors>(
    () =>
      skillTimeFactorsFor({
        levels: buildCharacterSkillLevels,
        nodeActivityByBlueprint: structure.nodeActivityByBlueprint,
        nodeTimeSkills: structure.nodeTimeSkills,
      }),
    [buildCharacterSkillLevels, structure],
  );

  // The TE-adjusted build-time figures. Its OWN memo, separate from the cost
  // `assemble()` — TE never enters the cost path. Reads the shared ME ledger for
  // per-node batched runs, then applies effective TE per blueprint.
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
        nameOf: (typeId) => structure.materialNames[typeId] ?? `Type ${typeId}`,
        // The selected structure's time factor by node activity (3.7.9.1.3);
        // a no-op (×1) when nothing is selected.
        structureTeFactorOf: structureFactors.structureTeFactorOf,
        // The selected build character's skills factor (3.7.19.1); a no-op (×1)
        // when no character is selected or its levels are unknown.
        skillTimeFactorOf: skillTimeFactors.skillTimeFactorOf,
      }),
    [structure, runs, ledger, ownedTe, teOverrides, structureFactors, skillTimeFactors],
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
        // One response, two maps: the ME map feeds the cost compute; the detail map
        // is the orb popover's readout channel (TE / owner / location) — kept apart
        // so the compute path stays byte-identical.
        setOwnedMe(new Map(res.data.blueprints.map((b) => [b.blueprintTypeId, b.me])));
        setOwnedDetail(
          new Map(
            res.data.blueprints.map((b) => [
              b.blueprintTypeId,
              { te: b.te, ownerType: b.ownerType, ownerName: b.ownerName, locationName: b.locationName, locationFlag: b.locationFlag },
            ]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [structure]);

  // Owned-asset overlay (3.7.7.2): fetch the caller's on-hand quantity + holdings
  // for every material/product in this build, once on open — per-user data can't
  // live in the static seed, so it arrives client-side (the owned-BP / net-margin
  // pattern). The read fires its own stale-gated server-side refresh; we never
  // refetch on a runs/ME recompute, so it's one call per blueprint open. The id set
  // is `toRefresh` (every priced node — raws + buildables + the product), the same
  // set the price loop uses, memoised on `structure`. Logged-out / owning none →
  // empty map → every QTY ring stays empty + every ledger shows '—' (placeholders).
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    apiFetch(ownedAssetsEndpoint, {
      body: { typeIds: toRefresh },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (ignore || !res.ok) return;
        setOwnedAssets(new Map(res.data.assets.map((a) => [a.typeId, a])));
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [structure, toRefresh]);

  // Reaction build-location fetch (3.7.13.3, the #187 seam live): for a REACTION
  // blueprint, the top job fees against the REACTION system's 'reaction' index, so
  // picking a reaction system fetches that system's fee inputs. Provider-owned
  // (not in the selector) because the system is set from TWO places — the search
  // submit and the corp deduce-lock — and one effect covers both. Gated to
  // reaction blueprints (a manufacturing build's reaction slot only scales rigs —
  // no fetch). Failure or unmount leaves null: net stays honestly unavailable.
  const reactionSystemId = reactionSystem?.systemId ?? null;
  useEffect(() => {
    // Unpicking needs no clear here: `reactionLocation` derives to null the
    // moment the stored system stops matching (the query-keyed shape above).
    if (structure.activityId !== REACTION_ACTIVITY || reactionSystemId === null) return;
    let ignore = false;
    const controller = new AbortController();
    apiFetch(buildLocationEndpoint, {
      body: { systemId: reactionSystemId, blueprintId: structure.blueprintTypeId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (ignore || !res.ok) return;
        setFetchedReactionLocation({
          systemId: reactionSystemId,
          blueprintTypeId: structure.blueprintTypeId,
          costIndex: res.data.costIndices.reaction ?? null,
          adjustedPrices: new Map(res.data.adjustedPrices.map((p) => [p.typeId, p.adjustedPrice])),
        });
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [structure, reactionSystemId]);

  // Available build structures (3.7.9.1.3): the caller's custom (and, next session,
  // corp) structures with resolved dogma, fetched once on open — per-user data
  // can't live in the static seed. Global to the user, so it doesn't refetch per
  // blueprint. Logged-out / none → empty list → the selector shows its empty state.
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    apiFetch(availableStructuresEndpoint, { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (ignore || !res.ok) return;
        setAvailableStructures(res.data.structures);
      })
      .catch(() => {});
    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

  // Recompute when runs, location, the owned-ME overlay, or a manual override
  // changes — independent of the one-shot refresh loop, which never fires onBatch
  // again once it finishes. Reads the latest pricing via a ref (not a dep) so it
  // fires only on a real runs/location/ME change, never on its own setPricing
  // (which would loop). Guarded on a settled non-null seed so it never overwrites
  // the "unavailable" state, and deferred via a 0ms timer so setState isn't called
  // synchronously from the effect body (the Cache-Components-safe shape used by
  // PricingSeeder).
  useEffect(() => {
    if (!seeded || !pricingRef.current) return;
    const t = setTimeout(() => assemble(), 0);
    return () => clearTimeout(t);
    // selectedStructure/reactionStructure ride along for the facility tax:
    // structureFactors alone can miss a pick that resolves no bonus (the shared
    // NO_STRUCTURE_FACTORS identity) whose tax must still apply.
  }, [
    runs,
    location,
    reactionLocation,
    selectedStructure,
    reactionStructure,
    ownedMe,
    meOverrides,
    structureFactors,
    costBasis,
    seeded,
    assemble,
  ]);

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

  // Mirrors assemble()'s reaction fee-input presence so the Net toggle enables
  // exactly when the fee math has something to compute (the reaction-slot fetch,
  // or the build-slot-refinery fallback whose index rides on `location`).
  const reactionNetAvailable =
    structure.activityId === REACTION_ACTIVITY &&
    (reactionLocation !== null ||
      (!!selectedStructure && hostsReactions(selectedStructure.groupId) && location !== null));

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
      buildCharacter,
      buildCharacterPending,
      buildCharacters,
      setBuildCharacter,
      availableStructures,
      selectedStructure,
      setSelectedStructure,
      structureFactors,
      buildCharacterSkillLevels,
      skillTimeFactors,
      reactionStructure,
      setReactionStructure,
      reactionSystem,
      setReactionSystem,
      reactionNetAvailable,
      buildStructureReadout,
      reactionStructureReadout,
      marketHistory,
      marketScore,
      ownedMe,
      ownedDetail,
      ownedAssets,
      meOverrides,
      setMeOverride,
      resetMeOverride,
      ownedTe,
      teOverrides,
      setTeOverride,
      resetTeOverride,
      ledger,
      ledgerMeOpts,
      buildTimes,
      costBasis,
      setCostBasis,
      applyBuildSystem,
      clearBuildLocation,
      savedBuildLocation,
      marginMode,
      setMarginMode,
      multibuyMode,
      setMultibuyMode,
      multibuyUncheckedTiers,
      setMultibuyUncheckedTiers,
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
      buildCharacter,
      buildCharacterPending,
      buildCharacters,
      setBuildCharacter,
      availableStructures,
      selectedStructure,
      setSelectedStructure,
      structureFactors,
      buildCharacterSkillLevels,
      skillTimeFactors,
      reactionStructure,
      setReactionStructure,
      reactionSystem,
      setReactionSystem,
      reactionNetAvailable,
      buildStructureReadout,
      reactionStructureReadout,
      marketHistory,
      marketScore,
      ownedMe,
      ownedDetail,
      ownedAssets,
      meOverrides,
      setMeOverride,
      resetMeOverride,
      ownedTe,
      teOverrides,
      setTeOverride,
      resetTeOverride,
      ledger,
      ledgerMeOpts,
      buildTimes,
      costBasis,
      setCostBasis,
      applyBuildSystem,
      clearBuildLocation,
      savedBuildLocation,
      marginMode,
      multibuyMode,
      multibuyUncheckedTiers,
      setMultibuyUncheckedTiers,
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
