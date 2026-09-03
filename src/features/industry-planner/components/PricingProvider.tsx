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
import { usePreference, usePreferencesReady } from '@/components/PreferencesProvider';
import { resolveBuildCharacter } from '@/components/run-as-state';
import { useAccountCharacters } from '@/components/use-account-characters';
import { apiFetch } from '@/transport/api-client';
import { industryCostBasis, plannerBuildCharacter, plannerBuildLocation } from '@/lib/preferences';
import {
  collectBlueprintTypeIds,
  collectRawTypeIds,
  computeBatchLedgerWithMe,
  type BatchLedger,
  type MeOptions,
} from '../build-batch';
import { savedBuildLocationRestoreOf } from '../build-location-view';
import { clampMe, effectiveMeOf } from '../me-overrides';
import { clampTe, effectiveTeOf } from '../te-overrides';
import type { MarginMode } from '../cockpit-margin';
import type { NetMode } from '../multibuy';
import { createBuildSystemApplier } from '../build-system-apply';

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
  structureReadouts,
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
  type BuildCharacterValue,
  type BuildPlanValue,
  type BuildSetupValue,
  type MarketDataValue,
  type PlannerConfigValue,
  type SelectedLocation,
  type SelectedReactionSystem,
  type SelectedStation,
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

function usePlannerPrefs(initialBuildCharacterId: number | null) {
  const [runs, setRunsState] = useState(1);
  const [rawBuildCharacterId, setBuildCharacter] = usePreference(plannerBuildCharacter, {
    serverValue: initialBuildCharacterId,
  });
  const [costBasis, setCostBasis] = usePreference(industryCostBasis);
  const [savedBuildLocation, setSavedBuildLocation] = usePreference(plannerBuildLocation);
  const preferencesReady = usePreferencesReady();
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
  const buildCharacterSkillLevels = useBuildCharacterSkillLevels(
    buildCharacter?.characterId ?? null,
  );
  const setRuns = useCallback((n: number) => {
    setRunsState(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }, []);
  return {
    buildCharacter,
    buildCharacterPending,
    buildCharacterSkillLevels,
    buildCharacters,
    costBasis,
    marginMode,
    multibuyMode,
    multibuyUncheckedTiers,
    preferencesReady,
    runs,
    savedBuildLocation,
    setBuildCharacter,
    setCostBasis,
    setMarginMode,
    setMultibuyMode,
    setMultibuyUncheckedTiers,
    setRuns,
    setSavedBuildLocation,
  };
}

function usePlannerLocationState(structure: BlueprintStructure) {
  const [location, setLocationState] = useState<SelectedLocation | null>(null);
  const [station, setStationState] = useState<SelectedStation | null>(null);
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
      }),
    [selectedStructure, location?.security, reactionStructure, reactionSecurity, structure.nodeActivityByBlueprint],
  );
  const { build: buildStructureReadout, reaction: reactionStructureReadout } = useMemo(
    () => structureReadouts({ selectedStructure, reactionStructure, factors: structureFactors }),
    [selectedStructure, reactionStructure, structureFactors],
  );
  const setLocation = useCallback((loc: SelectedLocation | null) => {
    setLocationState(loc);
    setStationState(null);
  }, []);
  const setStation = useCallback(
    (stationId: number | null, stationName: string | null) => {
      setStationState(stationId === null ? null : { id: stationId, name: stationName ?? '' });
    },
    [],
  );
  return {
    availableStructures,
    buildStructureReadout,
    location,
    reactionLocation,
    reactionStructure,
    reactionStructureReadout,
    reactionSystem,
    selectedStructure,
    setAvailableStructures,
    setFetchedReactionLocation,
    setLocation,
    setReactionStructure,
    setReactionSystem,
    setSelectedStructure,
    setStation,
    station,
    structureFactors,
  };
}

function usePlannerLocationWrites(
  structure: BlueprintStructure,
  location: SelectedLocation | null,
  setLocation: (loc: SelectedLocation | null) => void,
  savedBuildLocation: {
    systemId: number;
    systemName: string;
    security: number | null;
  } | null,
  setSavedBuildLocation: (
    value: {
      systemId: number;
      systemName: string;
      security: number | null;
    } | null,
  ) => void,
  preferencesReady: boolean,
  reactionSystemId: number | null,
  setFetchedReactionLocation: Dispatch<SetStateAction<ReactionLocationSnapshot | null>>,
  setAvailableStructures: Dispatch<SetStateAction<AvailableStructure[] | null>>,
) {
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
  const clearBuildLocation = useCallback(() => {
    setLocation(null);
    setSavedBuildLocation(null);
  }, [setLocation, setSavedBuildLocation]);
  const restoredRef = useRef(false);
  useEffect(() => {
    const savedLocationToRestore = savedBuildLocationRestoreOf({
      preferencesReady,
      alreadyRestored: restoredRef.current,
      location,
      savedBuildLocation,
    });
    if (!savedLocationToRestore) return;
    restoredRef.current = true;
    void applyBuildSystem(savedLocationToRestore, { persist: false });
  }, [preferencesReady, savedBuildLocation, location, applyBuildSystem]);
  const readReactionLocation = useCallback(
    async (signal: AbortSignal): Promise<ReactionLocationSnapshot | null> => {
      if (reactionSystemId === null) return null;
      const res = await apiFetch(buildLocationEndpoint, {
        body: { systemId: reactionSystemId, blueprintId: structure.blueprintTypeId },
        cache: 'no-store',
        signal,
      });
      return res.ok
        ? {
            systemId: reactionSystemId,
            blueprintTypeId: structure.blueprintTypeId,
            costIndex: res.data.costIndices.reaction ?? null,
            adjustedPrices: new Map(
              res.data.adjustedPrices.map((price) => [price.typeId, price.adjustedPrice]),
            ),
          }
        : null;
    },
    [reactionSystemId, structure.blueprintTypeId],
  );
  useResourceRead(readReactionLocation, {
    enabled: structure.activityId === REACTION_ACTIVITY && reactionSystemId !== null,
    onData: setFetchedReactionLocation,
  });
  const readAvailableStructures = useCallback(
    async (signal: AbortSignal): Promise<AvailableStructure[] | null> => {
      const res = await apiFetch(availableStructuresEndpoint, { cache: 'no-store', signal });
      return res.ok ? res.data.structures : null;
    },
    [],
  );
  useResourceRead(readAvailableStructures, {
    enabled: true,
    onData: setAvailableStructures,
  });
  return { applyBuildSystem, clearBuildLocation };
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
  readonly costBasis: 'batched' | 'marginal';
  readonly location: SelectedLocation | null;
  readonly meOverrides: Map<number, number>;
  readonly ownedMe: Map<number, number> | null;
  readonly reactionLocation: ReactionLocationSnapshot | null;
  readonly reactionStructure: AvailableStructure | null;
  readonly runs: number;
  readonly selectedStructure: AvailableStructure | null;
  readonly structureFactors: StructureFactors;
}

function usePriceClock(structure: BlueprintStructure, mirrors: PriceAssembleMirrors) {
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
    const owned = current.ownedMe;
    const overrides = current.meOverrides;
    const meOf = owned || overrides.size ? effectiveMeOf(owned, overrides) : undefined;
    setPricing(
      assemblePricing(structure, priceSnapshot.lookup, {
        runs: current.runs,
        fee,
        meOf,
        structureMeFactorOf: sf.active ? sf.structureMeFactorOf : undefined,
        basis: current.costBasis,
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
    mirrors.location,
    mirrors.reactionLocation,
    mirrors.selectedStructure,
    mirrors.reactionStructure,
    mirrors.ownedMe,
    mirrors.meOverrides,
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
  buildCharacterSkillLevels: ReturnType<typeof useBuildCharacterSkillLevels>,
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
    () => computeBatchLedgerWithMe(structure.tree, runs, ledgerMeOpts),
    [structure.tree, runs, ledgerMeOpts],
  );
  const skillTimeFactors = useMemo<SkillTimeFactors>(
    () =>
      skillTimeFactorsFor({
        levels: buildCharacterSkillLevels,
        nodeActivityByBlueprint: structure.nodeActivityByBlueprint,
        nodeTimeSkills: structure.nodeTimeSkills,
      }),
    [buildCharacterSkillLevels, structure],
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
  initialBuildCharacterId,
  children,
}: {
  structure: BlueprintStructure;
  pricingPromise: Promise<BlueprintPricing | null>;
  historyPromise: Promise<MarketHistoryInputs[]>;

  initialBuildCharacterId: number | null;
  children: ReactNode;
}) {
  const prefs = usePlannerPrefs(initialBuildCharacterId);
  const locationState = usePlannerLocationState(structure);
  const { applyBuildSystem, clearBuildLocation } = usePlannerLocationWrites(
    structure,
    locationState.location,
    locationState.setLocation,
    prefs.savedBuildLocation,
    prefs.setSavedBuildLocation,
    prefs.preferencesReady,
    locationState.reactionSystem?.systemId ?? null,
    locationState.setFetchedReactionLocation,
    locationState.setAvailableStructures,
  );
  const owned = usePlannerOwnedResources(structure);
  const ledger = usePlannerLedger(
    structure,
    prefs.runs,
    owned.ownedMe,
    owned.ownedDetail,
    locationState.structureFactors,
    prefs.buildCharacterSkillLevels,
  );
  const clock = usePriceClock(structure, {
    costBasis: prefs.costBasis,
    location: locationState.location,
    meOverrides: ledger.meOverrides,
    ownedMe: owned.ownedMe,
    reactionLocation: locationState.reactionLocation,
    reactionStructure: locationState.reactionStructure,
    runs: prefs.runs,
    selectedStructure: locationState.selectedStructure,
    structureFactors: locationState.structureFactors,
  });
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
      setLocation: locationState.setLocation,
      station: locationState.station,
      setStation: locationState.setStation,
      applyBuildSystem,
      clearBuildLocation,
      savedBuildLocation: prefs.savedBuildLocation,
      availableStructures: locationState.availableStructures,
      selectedStructure: locationState.selectedStructure,
      setSelectedStructure: locationState.setSelectedStructure,
      reactionStructure: locationState.reactionStructure,
      setReactionStructure: locationState.setReactionStructure,
      reactionSystem: locationState.reactionSystem,
      setReactionSystem: locationState.setReactionSystem,
      structureFactors: locationState.structureFactors,
      buildStructureReadout: locationState.buildStructureReadout,
      reactionStructureReadout: locationState.reactionStructureReadout,
      reactionNetAvailable,
    }),
    [
      locationState.location,
      locationState.setLocation,
      locationState.station,
      locationState.setStation,
      applyBuildSystem,
      clearBuildLocation,
      prefs.savedBuildLocation,
      locationState.availableStructures,
      locationState.selectedStructure,
      locationState.setSelectedStructure,
      locationState.reactionStructure,
      locationState.setReactionStructure,
      locationState.reactionSystem,
      locationState.setReactionSystem,
      locationState.structureFactors,
      locationState.buildStructureReadout,
      locationState.reactionStructureReadout,
      reactionNetAvailable,
    ],
  );
  const buildCharacterValue = useMemo<BuildCharacterValue>(
    () => ({
      buildCharacter: prefs.buildCharacter,
      buildCharacterPending: prefs.buildCharacterPending,
      buildCharacters: prefs.buildCharacters,
      setBuildCharacter: prefs.setBuildCharacter,
      buildCharacterSkillLevels: prefs.buildCharacterSkillLevels,
      skillTimeFactors: ledger.skillTimeFactors,
    }),
    [
      prefs.buildCharacter,
      prefs.buildCharacterPending,
      prefs.buildCharacters,
      prefs.setBuildCharacter,
      prefs.buildCharacterSkillLevels,
      ledger.skillTimeFactors,
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
    ],
  );

  return (
    <PlannerContextProviders
      marketData={marketDataValue}
      plannerConfig={plannerConfigValue}
      buildSetup={buildSetupValue}
      buildCharacter={buildCharacterValue}
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
