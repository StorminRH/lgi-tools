import type { ConfidenceLevel } from '@/components/ui/price-confidence';
import type { PriceSource } from '@/data/market-prices/types';

// View-model types for the discovery-browse cascade. Kept free of server
// imports (`@/db`, `next/cache`) so the client cascade components can import
// them without pulling the query layer into the client bundle.

// One catalog row (cascade column 0): a buildable product ranked by margin.
// `productTypeId` drives the icon + name; `blueprintTypeId` is the fan-out key
// and the `/industry/[id]` planner link. Margin/cost mirror the detail page's
// `assemblePricing` (cost = best buy; revenue = product best sell × qty/run).
export interface CatalogRow {
  blueprintTypeId: number;
  productTypeId: number;
  name: string;
  categoryName: string;
  activityId: number;
  inputCost: number;
  revenue: number | null;
  margin: number | null;
  marginPct: number | null;
  confidence: ConfidenceLevel;
  confidenceSummary: string;
}

// One direct input of a blueprint (a fanned cascade column). Carries the raw
// price signals rather than a baked confidence verdict, so the client column
// derives the `PriceConfidence` level against the live clock (matching the
// detail page) — the cached query stays clock-free. A buildable input carries
// its own `childBlueprintTypeId` so clicking it fans the next column.
export interface DirectInputRow {
  typeId: number;
  name: string;
  quantity: number;
  unitBuy: number | null;
  extendedCost: number | null;
  source: PriceSource | null;
  buyVolume: number | null;
  staleAfterMs: number | null;
  buildable: boolean;
  childBlueprintTypeId: number | null;
}

export interface DirectInputsView {
  blueprintTypeId: number;
  productTypeId: number;
  productName: string;
  rows: DirectInputRow[];
}
