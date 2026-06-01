import type { Tone } from '@/components/ui/tones';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import type { PriceSource } from '@/data/market-prices/types';

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

// --- Build-sequence tree -------------------------------------------------
// The "what do I make next" view: the dependency tree rooted at the product,
// shown as a phased build sequence. Two separate axes:
//   - STRUCTURE: per-type graph height (how many build stages sit beneath a
//     type, down to raw materials) — derived in the data layer.
//   - DISPLAY: a label + colour per type, every label a real in-game
//     identifier (activity / SDE group / category), never an invented bucket.
// Display data is keyed by typeId (per-type-stable) so a component shared
// across many parents carries it once, not per occurrence — keeping the
// cached structure small even for capital trees with millions of duplicates.

export interface BuildNodeDisplay {
  name: string;
  height: number; // 0 for a raw leaf; 1 + tallest input otherwise
  isRaw: boolean;
  label: string; // derived in-game identifier
  tone: Tone;
}

// One node in the nested build tree. Carries only the per-occurrence facts (its
// type and the absolute quantity one run of the final product needs);
// everything per-type-stable is looked up from `buildNodeDisplay`.
export interface BuildNode {
  typeId: number;
  quantity: number;
  inputs: BuildNode[];
}

// A raw-material source category present in this build, with its colour.
export interface MaterialCategoryMeta {
  label: string;
  tone: Tone;
}

export interface BlueprintStructure {
  blueprintTypeId: number;
  activityId: number;
  product: BlueprintProduct;
  // Nested breakdown for the structural tree display. Empty when the resolver
  // hasn't produced a tree for this blueprint yet.
  tree: TreeNode[];
  // The phased build-sequence tree: a single root (the product) whose nested
  // inputs descend reactions → components → raws. Empty when there is no tree.
  // `buildNodeDisplay` carries each type's label/colour/height (keyed by
  // typeId); `rootHeight` is the product's own height (1 = a T1 item whose
  // direct inputs are all raws).
  buildTree: BuildNode[];
  buildNodeDisplay: Record<number, BuildNodeDisplay>;
  rootHeight: number;
  // Flattened raw materials — the authoritative cost basis (already fully
  // recursed by the 3.0.4 resolver). Quantities are plain numbers (the DB
  // stores bigint; the largest real total — a capital's ~12M minerals — is far
  // under 2^53, so the narrowing is lossless).
  flatMaterials: { typeId: number; quantity: number }[];
  // typeId → raw-material source category label, for grouping the priced
  // ledger. `materialCategories` lists the present categories in display order
  // with their colours.
  materialCategory: Record<number, string>;
  materialCategories: MaterialCategoryMeta[];
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
  // Order-book depth + provenance, carried so the cost panel can show a
  // price-confidence badge (liquidity + source), not just cost. Null when
  // there is no price row.
  buyVolume: number | null;
  sellVolume: number | null;
  source: PriceSource | null;
  // Epoch millis of the row's stale_after, or null when there is no price row.
  // The client refreshes a material when this is null or already in the past —
  // honouring a row that confirmed "no orders" recently (future stale_after).
  staleAfterMs: number | null;
}

// A buildable intermediate's market price, carried only so the cascade can show
// a price-confidence badge on it (a build-vs-buy liquidity hint). These are NOT
// summed into the cost basis — the cost stays the recursed raw materials
// (`rows`). One entry per non-raw, non-root node typeId in the build tree.
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

export interface BlueprintPricing {
  rows: MaterialCostRow[];
  // Confidence-only side-channel for the buildable intermediates shown in the
  // cascade (kept out of `rows`/`summary` so the margin math is untouched).
  intermediatePrices: IntermediatePrice[];
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
