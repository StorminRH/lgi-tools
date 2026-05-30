import type { TreeNode } from '@/data/eve-data/tree-resolver';

// One searchable blueprint: its type ID and the name of the item it builds.
// Feeds the lazy Blueprints search source.
export interface BlueprintIndexEntry {
  blueprintTypeId: number;
  name: string;
}

// View-model types for the Industry Planner. The page composes two reads:
//  - `BlueprintStructure` — deploy-static structure (tree + flat materials +
//    names), cached `'max'`. Has no price dependency, so it renders in the
//    static shell.
//  - `BlueprintPricing` — the priced cost panel (flat materials × live prices +
//    margin), cached `'hours'`. Streams into a `<Suspense>` hole.

export interface BlueprintProduct {
  typeId: number;
  name: string;
  quantityPerRun: number;
}

export interface BlueprintStructure {
  blueprintTypeId: number;
  activityId: number;
  product: BlueprintProduct;
  // Nested breakdown for the structural tree display. Empty when the resolver
  // hasn't produced a tree for this blueprint yet.
  tree: TreeNode[];
  // Flattened raw materials — the authoritative cost basis (already fully
  // recursed by the 3.0.4 resolver). Quantities are plain numbers (the DB
  // stores bigint; the largest real total — a capital's ~12M minerals — is far
  // under 2^53, so the narrowing is lossless).
  flatMaterials: { typeId: number; quantity: number }[];
  // typeId → name for every type that appears in the tree, the flat list, or
  // as the product. Lets the structural tree label nodes without re-querying.
  materialNames: Record<number, string>;
}

export interface MaterialCostRow {
  typeId: number;
  name: string;
  quantity: number;
  unitBuy: number | null; // best buy = per-unit cost basis
  extendedCost: number | null; // quantity × unitBuy, null when unpriced
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  // Epoch millis of the row's stale_after, or null when there is no price row.
  // The client refreshes a material when this is null or already in the past —
  // honouring a row that confirmed "no orders" recently (future stale_after).
  staleAfterMs: number | null;
}

export interface BlueprintPricing {
  rows: MaterialCostRow[];
  product: {
    typeId: number;
    name: string;
    quantityPerRun: number;
    bestSell: number | null;
    staleAfterMs: number | null;
  };
  summary: {
    inputCost: number;
    revenue: number | null;
    margin: number | null;
    marginPct: number | null;
    // True when any material (or the product) has no usable price — the UI
    // marks the figure as an incomplete estimate rather than a hard number.
    incomplete: boolean;
  };
}
