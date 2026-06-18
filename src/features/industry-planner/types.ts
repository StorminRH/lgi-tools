import type { Tone } from '@/components/ui/tones';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import type { DepthBand, PriceSource } from '@/data/market-prices/types';

// One searchable blueprint: its own type ID, plus the type ID and name of the
// item it builds (the product, so the search dropdown can show the product's
// icon). Feeds the lazy Blueprints search source.
export interface BlueprintIndexEntry {
  blueprintTypeId: number;
  productTypeId: number;
  name: string;
}

// View-model types for the Industry Planner. The page composes two reads:
//  - `BlueprintStructure` — deploy-static structure (tree + names), cached
//    `'max'`. Has no price dependency, so it renders in the static shell.
//  - `BlueprintPricing` — the priced cost panel (whole-run batch materials ×
//    live prices + margin), cached `'hours'`. Streams into a `<Suspense>` hole.

export interface BlueprintProduct {
  typeId: number;
  name: string;
  quantityPerRun: number;
}

// Estimated industry job time for the Build-time KPI tile (top job · whole-tree
// "all jobs"). The figures are sourced by a follow-up data branch that reads the
// per-activity `time` from each blueprint's `activities` JSONB and models the
// all-jobs total + job sequencing; the tile renders an honest placeholder until
// that lands, so this stays `null` for now. Pre-formatted strings keep the tile
// agnostic to where/how the follow-up computes them.
export interface BuildTimeView {
  topJob: string; // top (product) job, e.g. "3h 28m"
  allJobs: string; // whole-tree total incl. component/reaction jobs, e.g. "≈ 2d 06h"
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

// --- Build-location selector + net margin (3.5.2b) -----------------------

// One searchable build system: the systems that hold ≥1 industry-capable NPC
// station (the only NPC build locations). `security` is the −1.0..1.0 status,
// null when unknown. Mirrors eve-data's IndustrySolarSystem; the wire shape for
// /api/industry/systems.
export interface SystemSearchEntry {
  id: number;
  name: string;
  security: number | null;
}

// One industry-capable NPC station in a system. NPC stations carry no name in
// the SDE, so `operationName` (the station-operation label) is the display name.
export interface IndustryStationView {
  id: number;
  operationName: string;
  manufacturingCapable: boolean;
  researchCapable: boolean;
}

// Everything the client needs to compute net margin once a build system is
// picked: its industry stations, both relevant system cost indices (null when
// the system has no stored index — the absent-vs-0.0 distinction), and the CCP
// adjusted prices for the product's direct ME0 base materials (EIV basis). The
// wire shape for /api/industry/build-location.
export interface BuildLocationData {
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  // Carried as a list (not a Record) so the wire stays number-keyed and typed;
  // the client builds a Map. Types with no usable adjusted price are simply
  // absent (so `map.get(id) ?? null` keeps the leaf's missing-vs-0.0 honesty).
  adjustedPrices: { typeId: number; adjustedPrice: number }[];
}

// The net-margin view derived client-side once a build location is picked
// (manufacturing blueprints only). Null on the gross-only path. Mirrors the
// pure leaf's NetMargin, minus the gross fields already in `summary`.
export interface NetMarginView {
  netMargin: number | null;
  netMarginPct: number | null;
  netCost: number | null;
  // The system cost index actually used (for the "System cost (x%)" ledger
  // label). Null when the system has no stored index.
  systemCostIndex: number | null;
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
  // Confidence-only side-channel for the buildable intermediates shown in the
  // cascade (kept out of `rows`/`summary` so the margin math is untouched).
  intermediatePrices: IntermediatePrice[];
  product: {
    typeId: number;
    name: string;
    quantityPerRun: number;
    bestSell: number | null;
    staleAfterMs: number | null;
    // Near-touch order-book depth ladders (3.5.3b), carried so the client
    // Market Score can read the product's liquidity without a second fetch.
    // Null when there's no price row / no orders on that side / Fuzzwork
    // fallback. Seeded global market data (system-agnostic), so adding it
    // doesn't bust the gross seed for blueprints with no depth — both are null.
    buyDepth: DepthBand[] | null;
    sellDepth: DepthBand[] | null;
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
  // Net margin + itemized fees, present only on the client net path (a build
  // location picked, manufacturing blueprint). Null on the server seed and the
  // gross-only client path, so the gross payload shape is unchanged.
  net: NetMarginView | null;
}
