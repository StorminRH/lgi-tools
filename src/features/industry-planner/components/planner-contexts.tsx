'use client';

import {
  createContext,
  useContext,
  useMemo,
  type Context,
  type ReactNode,
} from 'react';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { MarketScore } from '@/data/industry-math/market-score';
import type { BuildCharacter } from '@/components/run-as-state';
import type { BatchLedger, MeOptions } from '../build-batch';
import type { ApplySystemOutcome, BuildSystemRef } from '../build-system-apply';
import type { BuildTimes } from '../build-time';
import type { MarginMode } from '../cockpit-margin';
import type { NetMode } from '../multibuy';
import type { SkillTimeFactors } from '../skill-time';
import type { StructureFactors, StructureReadout } from '../structure-factors';
import type {
  AvailableStructure,
  BlueprintPricing,
  IndustryStationView,
  OwnedAssetEntry,
  OwnedComponentDetail,
} from '../types';

/**
 * A picked build SYSTEM, client-only state (carries a Map, so it never crosses
 * the wire). Built by the build-location selector from the chosen system + the
 * /api/industry/build-location read. The fee math reads only `adjustedPrices` +
 * `costIndices`, so this object changes only when the SYSTEM changes — the
 * per-station refinement lives in separate `station` state below, so picking a
 * station never churns this object (and never triggers a recompute).
 */
export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;
  // The system's industry-capable NPC stations, for the per-station refinement.
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

/**
 * The optional per-station refinement — display + future-score only; the fee
 * math is system-driven (flat NPC facility tax, per-system cost index), so the
 * station choice never changes the numbers in v1. Separate from SelectedLocation
 * so a station pick doesn't re-derive the pricing.
 */
export interface SelectedStation {
  id: number;
  name: string;
}

/**
 * Group B's own build system (3.7.12.2) — the reaction gap-filler refinery's system.
 * It scales B's reaction rigs AND, for a REACTION blueprint, keys the reaction
 * build-location fetch (3.7.13.3 — the #187 dead seam, live): the top reaction job
 * fees against THIS system's 'reaction' cost index, held in the provider's separate
 * `reactionLocation` state. A corp refinery deduce-locks this from its home system;
 * a custom refinery picks it. Kept apart from `location` (A's system) so the two are
 * independent.
 */
export interface SelectedReactionSystem {
  systemId: number;
  systemName: string;
  security: number | null;
}

export interface MarketDataValue {
  pricing: BlueprintPricing | null;
  // True once the streamed price read has settled — distinguishes "still
  // loading" (false) from "resolved, but no pricing available" (true +
  // pricing === null), so consumers don't show a perpetual loading state.
  seeded: boolean;
  // History-derived score inputs keyed by type ID (3.5.3a). Seeded from the
  // server (warm) and refreshed on view; the product type is always present
  // once it has stored history. 3.5.3b's Market Score reads this from here.
  marketHistory: Map<number, MarketHistoryInputs>;
  // The product's Market Score (3.5.3b) — the "how sure can I sell this?"
  // liquidity axis beside net margin. Derived client-side from runs (→ output
  // units), the product's history, and its near-touch depth, so it re-scores
  // live as runs change. score === null when no signal is known.
  marketScore: MarketScore;
}

export interface PlannerConfigValue {
  // Runs of the top product to build (default 1). Scales the cost basis, output
  // units, and the EIV base. 3.5.3b's market score reads this from here.
  runs: number;
  setRuns: (runs: number) => void;
  // The summary's cost basis — the Raw|Item toggle (3.7.21.1), persisted as the
  // industry.costBasis preference. 'marginal' (Item) is the default; the rows /
  // build plan stay batched regardless (only the KPI summary switches).
  costBasis: 'batched' | 'marginal';
  setCostBasis: (basis: 'batched' | 'marginal') => void;
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

export interface BuildSetupValue {
  // The picked build system (null = gross-only). 3.5.3b reads this from here.
  location: SelectedLocation | null;
  // Setting a system clears any prior station selection.
  setLocation: (location: SelectedLocation | null) => void;
  // The optional per-station refinement (display/future-score only).
  station: SelectedStation | null;
  setStation: (stationId: number | null, stationName: string | null) => void;
  // THE single build-system apply seam (3.7.23.1 — moved from the selector so
  // ONE generation counter serializes every caller: the selector's submit, the
  // lock/unlock transitions, the on-mount restore, and a template load; two
  // independent counters would let a slow restore clobber a later apply).
  // Fetches the system's live build data, seeds `location`, and (persist) saves
  // the identifier to the planner.buildLocation preference.
  applyBuildSystem: (
    sys: BuildSystemRef,
    opts: { persist: boolean },
  ) => Promise<ApplySystemOutcome>;
  // Clears the picked system AND the saved preference (the selector's Clear).
  clearBuildLocation: () => void;
  // The saved planner.buildLocation identifier — read by the selector's
  // unlock-restore transition (leaving a locked structure returns to it).
  savedBuildLocation: BuildSystemRef | null;
  // The structures the caller can place this build in (3.7.9.1.4) — their custom
  // structures (and, next session, their corp's), fetched once on open. null until
  // the read settles; empty for a logged-out caller or one with none.
  availableStructures: AvailableStructure[] | null;
  // The single selected build structure (role-agnostic): it bonuses each build node
  // by that node's activity. null clears the selection.
  selectedStructure: AvailableStructure | null;
  setSelectedStructure: (structure: AvailableStructure | null) => void;
  // The dedicated "react at" refinery (3.7.12.2) + its own system. Always available;
  // the routing derives roles: a lone refinery does the whole chain, and adding a
  // build structure takes over just the manufacturing nodes. Live-only, like the
  // build pick. For a REACTION blueprint the system also drives the reaction
  // build-location fetch (3.7.13.3), so the top reaction job fees against it.
  reactionStructure: AvailableStructure | null;
  setReactionStructure: (structure: AvailableStructure | null) => void;
  reactionSystem: SelectedReactionSystem | null;
  setReactionSystem: (system: SelectedReactionSystem | null) => void;
  // The derived per-node engine factors + per-activity bonus readout. Re-derives
  // when the selection or the build system's security changes.
  structureFactors: StructureFactors;
  // Per-slot readout pills — the bonus each slot is actually contributing (a slot shows
  // a pill only for an activity it hosts).
  buildStructureReadout: StructureReadout;
  reactionStructureReadout: StructureReadout;
  // Whether a REACTION blueprint has a fee source (3.7.13.3): the reaction slot's
  // fetched location, or a build-slot refinery with a location picked. Gates the
  // margin tile's Net toggle; always false on a manufacturing blueprint (whose
  // gate is `location !== null`).
  reactionNetAvailable: boolean;
}

export interface BuildCharacterValue {
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
  // The selected build character's trained ACTIVE skill levels (3.7.19.1), or
  // null while unset / loading / fail-open — the indicator reads the raw map to
  // name the applied levels.
  buildCharacterSkillLevels: Record<string, number> | null;
  // The derived per-node skills→time factors (identity when levels are null —
  // the all-or-nothing fail-open). Joins ONLY the buildTimes memo; `active`
  // drives the applied indicator + hover copy.
  skillTimeFactors: SkillTimeFactors;
}

export interface BuildPlanValue {
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
  // The caller's owned-blueprint TE, keyed by blueprint type id — derived from
  // `ownedDetail`, the time-side twin of `ownedMe`. Drives the TE adjuster + the
  // build-time figures. null until the owned read settles.
  ownedTe: Map<number, number> | null;
  // Manual per-node ME overrides (what-if), keyed by blueprint type id. Client-only
  // and NOT persisted — overlaid on `ownedMe` to drive the same `meOf` seam, so the
  // whole plan recomputes through one engine path. Empty by default → byte-identical
  // to the owned-only plan.
  meOverrides: Map<number, number>;
  // Set a node's manual ME (clamped 0–10); `reset` drops it back to owned-or-default.
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
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
}

const MarketDataContext = createContext<MarketDataValue | null>(null);
const PlannerConfigContext = createContext<PlannerConfigValue | null>(null);
const BuildSetupContext = createContext<BuildSetupValue | null>(null);
const BuildCharacterContext = createContext<BuildCharacterValue | null>(null);
const BuildPlanContext = createContext<BuildPlanValue | null>(null);

function usePlannerContext<T>(
  context: Context<T | null>,
  hookName: string,
): T {
  const value = useContext(context);
  if (!value) throw new Error(`${hookName} must be used within a PricingProvider`);
  return value;
}

export function useMarketData(): MarketDataValue {
  return usePlannerContext(MarketDataContext, 'useMarketData');
}

export function usePlannerConfig(): PlannerConfigValue {
  return usePlannerContext(PlannerConfigContext, 'usePlannerConfig');
}

export function useBuildSetup(): BuildSetupValue {
  return usePlannerContext(BuildSetupContext, 'useBuildSetup');
}

export function useBuildCharacter(): BuildCharacterValue {
  return usePlannerContext(BuildCharacterContext, 'useBuildCharacter');
}

export function useBuildPlan(): BuildPlanValue {
  return usePlannerContext(BuildPlanContext, 'useBuildPlan');
}

/**
 * Saved templates intentionally compose every configurable concern except
 * market data. This is their one sanctioned slice-internal aggregate, not a
 * general planner façade.
 */
export type TemplatePlannerState = PlannerConfigValue &
  BuildSetupValue &
  BuildCharacterValue &
  BuildPlanValue;

export function useTemplatePlanner(): TemplatePlannerState {
  const plannerConfig = usePlannerConfig();
  const buildSetup = useBuildSetup();
  const buildCharacter = useBuildCharacter();
  const buildPlan = useBuildPlan();
  return useMemo(
    () => ({
      ...plannerConfig,
      ...buildSetup,
      ...buildCharacter,
      ...buildPlan,
    }),
    [plannerConfig, buildSetup, buildCharacter, buildPlan],
  );
}

/**
 * The context taxonomy and nesting live together so PricingProvider supplies one
 * source of truth while consumers can only subscribe through concern-sized hooks.
 */
export function PlannerContextProviders({
  marketData,
  plannerConfig,
  buildSetup,
  buildCharacter,
  buildPlan,
  children,
}: {
  marketData: MarketDataValue;
  plannerConfig: PlannerConfigValue;
  buildSetup: BuildSetupValue;
  buildCharacter: BuildCharacterValue;
  buildPlan: BuildPlanValue;
  children: ReactNode;
}) {
  return (
    <MarketDataContext.Provider value={marketData}>
      <PlannerConfigContext.Provider value={plannerConfig}>
        <BuildSetupContext.Provider value={buildSetup}>
          <BuildCharacterContext.Provider value={buildCharacter}>
            <BuildPlanContext.Provider value={buildPlan}>{children}</BuildPlanContext.Provider>
          </BuildCharacterContext.Provider>
        </BuildSetupContext.Provider>
      </PlannerConfigContext.Provider>
    </MarketDataContext.Provider>
  );
}
