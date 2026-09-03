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

export interface SelectedLocation {
  systemId: number;
  systemName: string;
  security: number | null;

  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: Map<number, number>;
}

export interface SelectedStation {
  id: number;
  name: string;
}

export interface SelectedReactionSystem {
  systemId: number;
  systemName: string;
  security: number | null;
}

export interface MarketDataValue {
  pricing: BlueprintPricing | null;

  seeded: boolean;

  refreshing: boolean;

  marketHistory: Map<number, MarketHistoryInputs>;

  marketScore: MarketScore;
}

export interface PlannerConfigValue {

  runs: number;
  setRuns: (runs: number) => void;

  costBasis: 'batched' | 'marginal';
  setCostBasis: (basis: 'batched' | 'marginal') => void;

  marginMode: MarginMode;
  setMarginMode: (mode: MarginMode) => void;

  multibuyMode: NetMode;
  setMultibuyMode: (mode: NetMode) => void;
  multibuyUncheckedTiers: ReadonlySet<number>;
  setMultibuyUncheckedTiers: (tiers: ReadonlySet<number>) => void;
}

export interface BuildSetupValue {

  location: SelectedLocation | null;

  setLocation: (location: SelectedLocation | null) => void;

  station: SelectedStation | null;
  setStation: (stationId: number | null, stationName: string | null) => void;

  applyBuildSystem: (
    sys: BuildSystemRef,
    opts: { persist: boolean },
  ) => Promise<ApplySystemOutcome>;

  clearBuildLocation: () => void;

  savedBuildLocation: BuildSystemRef | null;

  availableStructures: AvailableStructure[] | null;

  selectedStructure: AvailableStructure | null;
  setSelectedStructure: (structure: AvailableStructure | null) => void;

  reactionStructure: AvailableStructure | null;
  setReactionStructure: (structure: AvailableStructure | null) => void;
  reactionSystem: SelectedReactionSystem | null;
  setReactionSystem: (system: SelectedReactionSystem | null) => void;

  structureFactors: StructureFactors;

  buildStructureReadout: StructureReadout;
  reactionStructureReadout: StructureReadout;

  reactionNetAvailable: boolean;
}

export interface BuildCharacterValue {

  buildCharacter: BuildCharacter | null;

  buildCharacterPending: boolean;

  buildCharacters: BuildCharacter[] | null;

  setBuildCharacter: (id: number | null) => void;

  buildCharacterSkillLevels: Record<string, number> | null;

  skillTimeFactors: SkillTimeFactors;
}

export interface BuildPlanValue {

  ownedMe: Map<number, number> | null;

  ownedDetail: Map<number, OwnedComponentDetail> | null;

  ownedAssets: Map<number, OwnedAssetEntry> | null;

  ownedTe: Map<number, number> | null;

  meOverrides: Map<number, number>;

  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;

  teOverrides: Map<number, number>;

  setTeOverride: (blueprintTypeId: number, te: number) => void;
  resetTeOverride: (blueprintTypeId: number) => void;

  ledger: BatchLedger;

  ledgerMeOpts: MeOptions;

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
