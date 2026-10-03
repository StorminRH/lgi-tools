'use client';

import {
  Suspense,
  use,
  useCallback,
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
import { computeMarketScore } from '@/data/industry-math/market-score';
import { useLoadingToast } from '@/components/ui/loading-toast';
import { usePreference } from '@/components/PreferencesProvider';
import { apiFetch } from '@/transport/api-client';
import { industryCostBasis } from '@/lib/preferences';
import {
  collectBlueprintTypeIds,
  collectRawTypeIds,
  computeBatchLedger,
  type BatchLedger,
  type MeOptions,
} from '../build-batch';
import { clampMe, effectiveMeOf } from '../me-overrides';
import { clampTe, effectiveTeOf } from '../te-overrides';
import type { MarginMode } from '../cockpit-margin';
import type { NetMode } from '../multibuy';

import { computeBuildTimes, type BuildTimes } from '../build-time';
import {
  ownedAssetsEndpoint,
  ownedBlueprintsEndpoint,
} from '../api-contract';
import { useComponentFeeSources, type ComponentFeeInputs } from './use-component-fee-sources';
import { useProfileFactors } from './use-planner-profile';
import type { ProfilePlan } from '../profiles/profile-plan';
import { usePlannerLocationWrites } from './use-planner-location-writes';
import { NO_SKILL_FACTORS, type SkillTimeFactors } from '../skill-time';
import { useResourceRead } from '../use-resource-read';
import { toMarketScoreInputs } from '../market-score-inputs';
import {
  assemblePricing,
  collectIntermediateTypeIds,
} from '../build-pricing';
import { mapOwnedBlueprints, type OwnedBlueprintMaps } from '../owned-blueprint-maps';
import { resetOverride, setOverride } from '../override-map';
import { createPriceSnapshot, type PriceSnapshot } from '../price-snapshot';
import {
  buildSelectionVacatesReaction,
  isReactionNetAvailable,
  selectReactionLocation,
  type ReactionLocationSnapshot,
} from '../selection-policy';
import {
  composeFeeInputs,
  structureFactorsFor,
  type StructureFactors,
} from '../structure-factors';
import type {
  AvailableStructure,
  BlueprintPricing,
  BlueprintStructure,
  OwnedAssetEntry,
  OwnedComponentDetail,
} from '../types';
import {
  PlannerContextProviders,
  type BuildPlanValue,
  type BuildSetupValue,
  type MarketDataValue,
  type PlannerConfigValue,
  type SelectedLocation,
  type SelectedReactionSystem,
} from './planner-contexts';

function PricingSeeder({
  pricingPromise,
  onSeed,
}: {
  pricingPromise: Promise<BlueprintPricing | null>;
  onSeed: (pricing: BlueprintPricing | null) => void;
}) {
  const resolved = use(pricingPromise);
  useEffect(() => {
    const t = setTimeout(() => onSeed(resolved), 0);
    return () => clearTimeout(t);
  }, [resolved, onSeed]);
  return null;
}

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

function useOverrideSetters(
  setOverrides: Dispatch<SetStateAction<Map<number, number>>>,
  clamp: (n: number) => number,
) {
  const set = useCallback(
    (blueprintTypeId: number, value: number) => {
      setOverrides((prev) => setOverride(prev, blueprintTypeId, value, clamp));
    },
    [setOverrides, clamp],
  );
  const reset = useCallback(
    (blueprintTypeId: number) => {
      setOverrides((prev) => resetOverride(prev, blueprintTypeId));
    },
    [setOverrides],
  );
  return { set, reset };
}

function usePlannerPrefs() {
  const [runs, setRunsState] = useState(1);
  const [costBasis, setCostBasis] = usePreference(industryCostBasis);
  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const [multibuyMode, setMultibuyMode] = useState<NetMode>('Remaining');
  const [multibuyUncheckedTiers, setMultibuyUncheckedTiersState] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const setMultibuyUncheckedTiers = useCallback((tiers: ReadonlySet<number>) => {
    setMultibuyUncheckedTiersState(new Set(tiers));
  }, []);
  const setRuns = useCallback((n: number) => {
    setRunsState(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }, []);
  return {
    costBasis,
    marginMode,
    multibuyMode,
    multibuyUncheckedTiers,
    runs,
    setCostBasis,
    setMarginMode,
    setMultibuyMode,
    setMultibuyUncheckedTiers,
    setRuns,
  };
}

function usePlannerLocationState(structure: BlueprintStructure) {
  const [location, setLocationState] = useState<SelectedLocation | null>(null);
  const [availableStructures, setAvailableStructures] = useState<AvailableStructure[] | null>(null);
  const [selectedStructure, setSelectedStructureState] = useState<AvailableStructure | null>(null);
  const [reactionStructure, setReactionStructure] = useState<AvailableStructure | null>(null);
  const [reactionSystem, setReactionSystem] = useState<SelectedReactionSystem | null>(null);
  const [fetchedReactionLocation, setFetchedReactionLocation] =
    useState<ReactionLocationSnapshot | null>(null);
  const reactionSecurity = reactionSystem?.security ?? null;
  const reactionLocation = selectReactionLocation({
    activityId: structure.activityId,
    blueprintTypeId: structure.blueprintTypeId,
    reactionSystemId: reactionSystem?.systemId ?? null,
    fetched: fetchedReactionLocation,
  });
  const setSelectedStructure = useCallback(
    (next: AvailableStructure | null) => {
      setSelectedStructureState(next);
      if (buildSelectionVacatesReaction(next, reactionStructure)) {
        setReactionStructure(null);
        setReactionSystem(null);
      }
    },
    [reactionStructure],
  );
  const structureFactors = useMemo<StructureFactors>(
    () =>
      structureFactorsFor({
        selectedStructure,
        locationSecurity: location?.security ?? null,
        reactionStructure,
        reactionSecurity,
        nodeActivityByBlueprint: structure.nodeActivityByBlueprint,
        nodeFilterIds: structure.nodeFilterIds,
        topBlueprintTypeId: structure.blueprintTypeId,
      }),
    [
      selectedStructure,
      location?.security,
      reactionStructure,
      reactionSecurity,
      structure.nodeActivityByBlueprint,
      structure.nodeFilterIds,
      structure.blueprintTypeId,
    ],
  );
  return {
    availableStructures,
    location,
    reactionLocation,
    reactionStructure,
    reactionSystem,
    selectedStructure,
    setAvailableStructures,
    setFetchedReactionLocation,
    setLocation: setLocationState,
    setReactionStructure,
    setReactionSystem,
    setSelectedStructure,
    structureFactors,
  };
}

function usePlannerOwnedResources(structure: BlueprintStructure) {
  const [ownedMe, setOwnedMe] = useState<Map<number, number> | null>(null);
  const [ownedDetail, setOwnedDetail] = useState<Map<number, OwnedComponentDetail> | null>(null);
  const [ownedAssets, setOwnedAssets] = useState<Map<number, OwnedAssetEntry> | null>(null);
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
  const ownedBlueprintTypeIds = useMemo(
    () => collectBlueprintTypeIds(structure.tree, structure.blueprintTypeId),
    [structure],
  );
  const readOwnedBlueprints = useCallback(
    async (signal: AbortSignal): Promise<OwnedBlueprintMaps | null> => {
      const res = await apiFetch(ownedBlueprintsEndpoint, {
        body: { blueprintTypeIds: ownedBlueprintTypeIds },
        cache: 'no-store',
        signal,
      });
      return res.ok ? mapOwnedBlueprints(res.data.blueprints) : null;
    },
    [ownedBlueprintTypeIds],
  );
  const applyOwnedBlueprints = useCallback((maps: OwnedBlueprintMaps) => {
    setOwnedMe(maps.ownedMe);
    setOwnedDetail(maps.ownedDetail);
  }, []);
  useResourceRead(readOwnedBlueprints, {
    enabled: true,
    onData: applyOwnedBlueprints,
  });
  const readOwnedAssets = useCallback(
    async (signal: AbortSignal): Promise<Map<number, OwnedAssetEntry> | null> => {
      const res = await apiFetch(ownedAssetsEndpoint, {
        body: { typeIds: toRefresh },
        cache: 'no-store',
        signal,
      });
      return res.ok ? new Map(res.data.assets.map((asset) => [asset.typeId, asset])) : null;
    },
    [toRefresh],
  );
  useResourceRead(readOwnedAssets, {
    enabled: true,
    onData: setOwnedAssets,
  });
  return { ownedAssets, ownedDetail, ownedMe, toRefresh };
}

interface PriceAssembleMirrors {
  readonly components: ComponentFeeInputs | null;
  readonly costBasis: 'batched' | 'marginal';
  readonly ledger: BatchLedger;
  readonly ledgerMeOpts: MeOptions;
  readonly location: SelectedLocation | null;
  readonly reactionLocation: ReactionLocationSnapshot | null;
  readonly reactionStructure: AvailableStructure | null;
  readonly runs: number;
  readonly selectedStructure: AvailableStructure | null;
  readonly structureFactors: StructureFactors;
}

function usePriceClock(
  structure: BlueprintStructure,
  inputs: Omit<PriceAssembleMirrors, 'components'>,
  plan: ProfilePlan | null,
) {
  // Pricing owns the per-job fee sources for the profile installing the build.
  const components = useComponentFeeSources(structure, plan);
  const mirrors: PriceAssembleMirrors = { ...inputs, components };
  const [pricing, setPricing] = useState<BlueprintPricing | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [priceSnapshot] = useState(() => createPriceSnapshot());
  const mirrorsRef = useRef(mirrors);
  const pricingRef = useRef(pricing);
  useEffect(() => {
    mirrorsRef.current = mirrors;
    pricingRef.current = pricing;
  });
  const assemble = useCallback(() => {
    const current = mirrorsRef.current;
    const sf = current.structureFactors;
    const fee = composeFeeInputs({
      location: current.location,
      reactionLocation: current.reactionLocation,
      buildStructure: current.selectedStructure,
      reactionStructure: current.reactionStructure,
      structureCostBonusPct: sf.structureCostBonusPct,
    });
    setPricing(
      assemblePricing(structure, priceSnapshot.lookup, {
        runs: current.runs,
        fee: fee && current.components ? { ...fee, components: current.components } : fee,
        meOf: current.ledgerMeOpts.meOf,
        structureMeFactorOf: current.ledgerMeOpts.structureMeFactorOf,
        basis: current.costBasis,
        ledger: current.ledger,
      }),
    );
  }, [structure, priceSnapshot]);
  const seed = useCallback(
    (initial: BlueprintPricing | null) => {
      const settlement = priceSnapshot.seed(initial);
      setSeeded(settlement.seeded);
      setPricing(settlement.settle);
    },
    [priceSnapshot],
  );
  useEffect(() => {
    if (!seeded || !pricingRef.current) return;
    const t = setTimeout(() => assemble(), 0);
    return () => clearTimeout(t);
  }, [
    mirrors.runs,
    mirrors.components,
    mirrors.location,
    mirrors.reactionLocation,
    mirrors.selectedStructure,
    mirrors.reactionStructure,
    mirrors.ledger,
    mirrors.ledgerMeOpts,
    mirrors.structureFactors,
    mirrors.costBasis,
    seeded,
    assemble,
  ]);
  return { assemble, priceSnapshot, pricing, seed, seeded };
}

function useMarketRefresh(
  structure: BlueprintStructure,
  seeded: boolean,
  pricing: BlueprintPricing | null,
  assemble: () => void,
  priceSnapshot: PriceSnapshot,
  runs: number,
  toRefresh: number[],
) {
  const [marketHistory, setMarketHistory] = useState<Map<number, MarketHistoryInputs>>(
    () => new Map(),
  );
  const onBatch = useCallback(
    (refreshed: Map<number, RefreshedPrice>) => {
      priceSnapshot.applyBatch(refreshed);
      assemble();
    },
    [assemble, priceSnapshot],
  );
  const { refreshing } = useRefreshOnView(toRefresh, {
    enabled: seeded && !!pricing,
    onBatch,
  });
  useLoadingToast(refreshing);
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
  useRefreshHistoryOnView([structure.product.typeId], {
    enabled: seeded,
    onResult: onHistoryResult,
  });
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
  return { marketHistory, marketScore, mergeHistory, refreshing };
}

function usePlannerLedger(
  structure: BlueprintStructure,
  runs: number,
  ownedMe: Map<number, number> | null,
  ownedDetail: Map<number, OwnedComponentDetail> | null,
  structureFactors: StructureFactors,
  skillTimeFactors: SkillTimeFactors,
) {
  const [meOverrides, setMeOverrides] = useState<Map<number, number>>(() => new Map());
  const [teOverrides, setTeOverrides] = useState<Map<number, number>>(() => new Map());
  const { set: setMeOverride, reset: resetMeOverride } = useOverrideSetters(setMeOverrides, clampMe);
  const { set: setTeOverride, reset: resetTeOverride } = useOverrideSetters(setTeOverrides, clampTe);
  const ownedTe = useMemo<Map<number, number> | null>(
    () => (ownedDetail ? new Map([...ownedDetail].map(([bp, d]) => [bp, d.te])) : null),
    [ownedDetail],
  );
  const ledgerMeOpts = useMemo<MeOptions>(
    () => ({
      meOf: effectiveMeOf(ownedMe, meOverrides),
      topBlueprintTypeId: structure.blueprintTypeId,
      structureMeFactorOf: structureFactors.structureMeFactorOf,
    }),
    [structure.blueprintTypeId, ownedMe, meOverrides, structureFactors],
  );
  const ledger = useMemo<BatchLedger>(
    () => computeBatchLedger(structure.tree, runs, ledgerMeOpts),
    [structure.tree, runs, ledgerMeOpts],
  );
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
        structureTeFactorOf: structureFactors.structureTeFactorOf,
        skillTimeFactorOf: skillTimeFactors.skillTimeFactorOf,
      }),
    [structure, runs, ledger, ownedTe, teOverrides, structureFactors, skillTimeFactors],
  );
  return {
    buildTimes,
    ledger,
    ledgerMeOpts,
    meOverrides,
    ownedTe,
    resetMeOverride,
    resetTeOverride,
    setMeOverride,
    setTeOverride,
    skillTimeFactors,
    teOverrides,
  };
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
  const prefs = usePlannerPrefs();
  const locationState = usePlannerLocationState(structure);
  const locationWrites = usePlannerLocationWrites(
    structure,
    locationState.setLocation,
    locationState.reactionSystem?.systemId ?? null,
    locationState.setFetchedReactionLocation,
    locationState.setAvailableStructures,
  );
  // Under a profile each job takes its own facility's bonus and character; with none, the build is baseline.
  const profile = useProfileFactors(structure, {
    ...locationState,
    applyBuildSystem: locationWrites.applyBuildSystem,
    locationRefreshKey: locationWrites.retry,
  });
  const locationFailed = locationWrites.failureSystemId !== null &&
    locationWrites.failureSystemId === profile.plan?.top.facility?.systemId;
  const { structureFactors } = profile;
  const owned = usePlannerOwnedResources(structure);
  const ledger = usePlannerLedger(
    structure,
    prefs.runs,
    owned.ownedMe,
    owned.ownedDetail,
    structureFactors,
    profile.skillTimeFactors ?? NO_SKILL_FACTORS,
  );
  const clock = usePriceClock(structure, {
    costBasis: prefs.costBasis,
    ledger: ledger.ledger,
    ledgerMeOpts: ledger.ledgerMeOpts,
    location: locationState.location,
    reactionLocation: locationState.reactionLocation,
    reactionStructure: locationState.reactionStructure,
    runs: prefs.runs,
    selectedStructure: locationState.selectedStructure,
    structureFactors,
  }, profile.plan);
  const market = useMarketRefresh(
    structure,
    clock.seeded,
    clock.pricing,
    clock.assemble,
    clock.priceSnapshot,
    prefs.runs,
    owned.toRefresh,
  );
  const reactionNetAvailable = isReactionNetAvailable({
    activityId: structure.activityId,
    reactionLocation: locationState.reactionLocation,
    buildStructure: locationState.selectedStructure,
    hasBuildLocation: locationState.location !== null,
  });
  const marketDataValue = useMemo<MarketDataValue>(
    () => ({
      pricing: clock.pricing,
      seeded: clock.seeded,
      refreshing: market.refreshing,
      marketHistory: market.marketHistory,
      marketScore: market.marketScore,
    }),
    [clock.pricing, clock.seeded, market.refreshing, market.marketHistory, market.marketScore],
  );
  const plannerConfigValue = useMemo<PlannerConfigValue>(
    () => ({
      runs: prefs.runs,
      setRuns: prefs.setRuns,
      costBasis: prefs.costBasis,
      setCostBasis: prefs.setCostBasis,
      marginMode: prefs.marginMode,
      setMarginMode: prefs.setMarginMode,
      multibuyMode: prefs.multibuyMode,
      setMultibuyMode: prefs.setMultibuyMode,
      multibuyUncheckedTiers: prefs.multibuyUncheckedTiers,
      setMultibuyUncheckedTiers: prefs.setMultibuyUncheckedTiers,
    }),
    [
      prefs.runs,
      prefs.setRuns,
      prefs.costBasis,
      prefs.setCostBasis,
      prefs.marginMode,
      prefs.setMarginMode,
      prefs.multibuyMode,
      prefs.setMultibuyMode,
      prefs.multibuyUncheckedTiers,
      prefs.setMultibuyUncheckedTiers,
    ],
  );
  const buildSetupValue = useMemo<BuildSetupValue>(
    () => ({
      location: locationState.location,
      reactionSystem: locationState.reactionSystem,
      structureFactors,
      reactionNetAvailable,
      profiles: profile.profiles,
      profilesFailed: profile.profilesFailed,
      refreshProfiles: profile.refreshProfiles,
      locationFailed,
      retryLocation: locationWrites.retryLocation,
      profile: profile.profile,
      setProfileId: profile.setProfileId,
      profilePlan: profile.plan,
    }),
    [
      locationState.location,
      locationState.reactionSystem,
      structureFactors,
      reactionNetAvailable,
      profile.profiles,
      profile.profilesFailed,
      profile.refreshProfiles,
      locationFailed,
      locationWrites.retryLocation,
      profile.profile,
      profile.setProfileId,
      profile.plan,
    ],
  );
  const buildPlanValue = useMemo<BuildPlanValue>(
    () => ({
      ownedMe: owned.ownedMe,
      ownedDetail: owned.ownedDetail,
      ownedAssets: owned.ownedAssets,
      ownedTe: ledger.ownedTe,
      meOverrides: ledger.meOverrides,
      setMeOverride: ledger.setMeOverride,
      resetMeOverride: ledger.resetMeOverride,
      teOverrides: ledger.teOverrides,
      setTeOverride: ledger.setTeOverride,
      resetTeOverride: ledger.resetTeOverride,
      ledger: ledger.ledger,
      ledgerMeOpts: ledger.ledgerMeOpts,
      buildTimes: ledger.buildTimes,
      skillTimeFactors: ledger.skillTimeFactors,
    }),
    [
      owned.ownedMe,
      owned.ownedDetail,
      owned.ownedAssets,
      ledger.ownedTe,
      ledger.meOverrides,
      ledger.setMeOverride,
      ledger.resetMeOverride,
      ledger.teOverrides,
      ledger.setTeOverride,
      ledger.resetTeOverride,
      ledger.ledger,
      ledger.ledgerMeOpts,
      ledger.buildTimes,
      ledger.skillTimeFactors,
    ],
  );

  return (
    <PlannerContextProviders
      marketData={marketDataValue}
      plannerConfig={plannerConfigValue}
      buildSetup={buildSetupValue}
      buildPlan={buildPlanValue}
    >
      {children}
      <Suspense fallback={null}>
        <PricingSeeder pricingPromise={pricingPromise} onSeed={clock.seed} />
      </Suspense>
      <Suspense fallback={null}>
        <HistorySeeder historyPromise={historyPromise} onSeed={market.mergeHistory} />
      </Suspense>
    </PlannerContextProviders>
  );
}
