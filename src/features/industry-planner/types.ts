import type { Tone } from '@/components/ui/tones';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import type { DepthBand, PriceSource, RegionalDiscount } from '@/data/market-prices/types';

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
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
}

export interface OwnedBlueprintsResponse {
  blueprints: OwnedBlueprintMeEntry[];
}

export type OwnedComponentDetail = Omit<OwnedBlueprintMeEntry, 'blueprintTypeId' | 'me'>;

export interface AssetHolding {
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
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
