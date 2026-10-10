import type { Tone } from '@/components/ui/tones';
import type { TreeNode } from '@/data/eve-data/types';
import type { DepthBand, PriceSource, RegionalDiscount } from '@/data/market-prices/types';
import type { EsiOwnerType } from '@/platform/owner-sync/owner-type';

export type {
  AvailableStructure,
  AvailableStructuresResponse,
} from './api-contract';

export interface BlueprintIndexEntry {
  blueprintTypeId: number;
  productTypeId: number;
  name: string;
}

export interface BlueprintProduct {
  typeId: number;
  name: string;
  quantityPerRun: number;
  renderable: boolean;
}

export interface BuildNodeDisplay {
  name: string;
  height: number;
  isRaw: boolean;
  label: string;
  tone: Tone;
}

export interface BuildNode {
  typeId: number;
  quantity: number;
  inputs: BuildNode[];
}

export interface MaterialCategoryMeta {
  label: string;
  tone: Tone;
}

export interface BlueprintStructure {
  blueprintTypeId: number;
  activityId: number;
  product: BlueprintProduct;
  tree: TreeNode[];
  buildTree: BuildNode[];
  buildNodeDisplay: Record<number, BuildNodeDisplay>;
  rootHeight: number;
  materialCategory: Record<number, string>;
  materialCategories: MaterialCategoryMeta[];
  materialNames: Record<number, string>;
  topJobSeconds: number | null;
  nodeJobSeconds: Record<number, number>;
  nodeActivityByBlueprint: Record<number, number>;
  /** CCP's industry target filters each blueprint's product belongs to: which hull and rig bonuses reach that job. */
  nodeFilterIds: Record<number, number[]>;
  nodeTimeSkills: Record<
    number,
    { skillTypeId: number; skillName: string; timePctPerLevel: number }[]
  >;
}

export interface MaterialCostRow {
  typeId: number;
  name: string;
  quantity: number;
  unitBuy: number | null;
  extendedCost: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  source: PriceSource | null;
  staleAfterMs: number | null;
}

export interface IntermediatePrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  source: PriceSource | null;
  staleAfterMs: number | null;
}

export interface IndustryStationView {
  id: number;
  name: string | null;
  operationName: string;
  manufacturingCapable: boolean;
  researchCapable: boolean;
}

export interface BuildLocationData {
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  adjustedPrices: { typeId: number; adjustedPrice: number }[];
}

/** One system's job cost indices; null where the system has none for the activity. */
export interface SystemJobCostIndex {
  systemId: number;
  manufacturing: number | null;
  reaction: number | null;
}

/** One job below the product's own, and its install fee where the profile runs it. */
export interface ComponentJobFee {
  typeId: number;
  blueprintTypeId: number;
  reaction: boolean;
  runs: number;
  systemId: number | null;
  systemCostIndex: number | null;
  facilityTaxRate: number;
  fee: NetMarginView['jobFee'];
}

/** The install fees of every job that makes the product's inputs. */
export interface ComponentJobFees {
  jobs: ComponentJobFee[];
  /** Null while any job's system has no cost index. */
  total: number | null;
}

export interface NetMarginView {
  netMargin: number | null;
  netMarginPct: number | null;
  netCost: number | null;
  systemCostIndex: number | null;
  facilityTaxRate: number;
  facilityTaxAssumed: boolean;
  jobFee: {
    estimatedItemValue: number;
    jobGrossCost: number | null;
    facilityTax: number;
    sccSurcharge: number;
    total: number | null;
    missingSystemCostIndex: boolean;
    missingAdjustedPriceTypeIds: number[];
  };
  sellSide: { salesTax: number | null; brokerFee: number | null; total: number | null };
  /** The fees of the jobs below the product's; null where only the product's own job is priced. */
  componentJobs: ComponentJobFees | null;
}

export interface BlueprintPricing {
  rows: MaterialCostRow[];
  intermediatePrices: IntermediatePrice[];
  product: {
    typeId: number;
    name: string;
    quantityPerRun: number;
    bestSell: number | null;
    pct5Sell: number | null;
    staleAfterMs: number | null;
    buyDepth: DepthBand[] | null;
    sellDepth: DepthBand[] | null;
    regionalDiscount: RegionalDiscount | null;
  };
  summary: {
    basis: 'batched' | 'marginal';
    bases: { batched: number; marginal: number };
    inputCost: number;
    revenue: number | null;
    margin: number | null;
    marginPct: number | null;
    incomplete: boolean;
  };
  net: NetMarginView | null;
}

export interface OwnedBlueprintMeEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: EsiOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  containerName: string | null;
}

export interface OwnedBlueprintsResponse {
  blueprints: OwnedBlueprintMeEntry[];
}

export type OwnedComponentDetail = Omit<OwnedBlueprintMeEntry, 'blueprintTypeId' | 'me'>;

export interface AssetHolding {
  ownerType: EsiOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  containerName: string | null;
  quantity: number;
}

export interface OwnedAssetEntry {
  typeId: number;
  ownedQty: number;
  heldBy: AssetHolding[];
}

export interface OwnedAssetsResponse {
  assets: OwnedAssetEntry[];
}
