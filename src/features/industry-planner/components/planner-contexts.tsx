'use client';

import { createContext, useContext, type Context, type ReactNode } from 'react';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { MarketScore } from '@/data/industry-math/market-score';
import type { BatchLedger, MeOptions } from '../build-batch';
import type { BuildTimes } from '../build-time';
import type { MarginMode } from '../cockpit-margin';
import type { NetMode } from '../multibuy';
import type { IndustryProfileRow } from '../profiles/api-contract';
import type { ProfilePlan } from '../profiles/profile-plan';
import type { SkillTimeFactors } from '../skill-time';
import type { StructureFactors } from '../structure-factors';
import type {
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
  /** The system the product's own job is priced in; a profile picks it. */
  location: SelectedLocation | null;
  reactionSystem: SelectedReactionSystem | null;
  structureFactors: StructureFactors;
  reactionNetAvailable: boolean;
  /** The account's production profiles; null when signed out or still loading. */
  profiles: IndustryProfileRow[] | null;
  profilesFailed: boolean;
  refreshProfiles: () => void;
  locationFailed: boolean;
  retryLocation: () => void;
  /** The production profile the build runs under; null builds at baseline. */
  profile: IndustryProfileRow | null;
  setProfileId: (id: string) => void;
  profilePlan: ProfilePlan | null;
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
  skillTimeFactors: SkillTimeFactors;
}

const MarketDataContext = createContext<MarketDataValue | null>(null);
const PlannerConfigContext = createContext<PlannerConfigValue | null>(null);
const BuildSetupContext = createContext<BuildSetupValue | null>(null);
const BuildPlanContext = createContext<BuildPlanValue | null>(null);

function usePlannerContext<T>(context: Context<T | null>, hookName: string): T {
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

export function useBuildPlan(): BuildPlanValue {
  return usePlannerContext(BuildPlanContext, 'useBuildPlan');
}

export function PlannerContextProviders({
  marketData,
  plannerConfig,
  buildSetup,
  buildPlan,
  children,
}: {
  marketData: MarketDataValue;
  plannerConfig: PlannerConfigValue;
  buildSetup: BuildSetupValue;
  buildPlan: BuildPlanValue;
  children: ReactNode;
}) {
  return (
    <MarketDataContext.Provider value={marketData}>
      <PlannerConfigContext.Provider value={plannerConfig}>
        <BuildSetupContext.Provider value={buildSetup}>
          <BuildPlanContext.Provider value={buildPlan}>{children}</BuildPlanContext.Provider>
        </BuildSetupContext.Provider>
      </PlannerConfigContext.Provider>
    </MarketDataContext.Provider>
  );
}
