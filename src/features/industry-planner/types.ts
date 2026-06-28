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
  // The top product's base build time (CCP SDE seconds for one run, ME0/TE0, no
  // skill/structure bonuses), or null when the blueprint has none. The Build-time
  // tile scales it by runs.
  topJobSeconds: number | null;
  // blueprintTypeId → base build seconds (ME0/TE0) for the top blueprint and every
  // producing blueprint in the tree (intermediates + reactions). Feeds the
  // whole-tree "total job time" KPI, which applies TE per blueprint and sums the
  // batched runs. A degenerate blueprint with no positive time is simply absent.
  nodeJobSeconds: Record<number, number>;
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

// One industry-capable NPC station in a system. `name` is the full in-game
// station name (ESI-resolved); null when unresolved, so the picker falls back to
// `operationName` (the station-operation label).
export interface IndustryStationView {
  id: number;
  name: string | null;
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

// --- Owned-blueprint ME overlay (3.7.5.2) --------------------------------

// One owned blueprint's effective material efficiency + readout detail, keyed by
// blueprint type. `me` is the best ME across all the caller's copies of that
// blueprint (resolved server-side); `te`, owner, and location describe that same
// best copy — informational popover rows, never part of the cost compute. The wire
// shape for /api/industry/owned-blueprints; the client builds a
// Map<blueprintTypeId, me> for the cost basis and a parallel detail map for the orb.
// ownerType is the wire's own literal (the DB enum lives in the owned-blueprints
// slice, which a feature may not import — features never import each other).
export interface OwnedBlueprintMeEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
}

// The owned-ME overlay payload: only the blueprints the caller owns among those
// requested. Blueprints absent from the list are unowned → the client applies
// ME0 to them (the byte-identical gross path). Empty for a logged-out caller.
export interface OwnedBlueprintsResponse {
  blueprints: OwnedBlueprintMeEntry[];
}

// The readout detail for an owned component's orb popover (3.7.5.5): the best
// owned copy's TE + owner + location. Built client-side into a
// Map<blueprintTypeId, …> parallel to the ME map, and NEVER read by the cost
// compute — purely informational rows.
export type OwnedComponentDetail = Omit<OwnedBlueprintMeEntry, 'blueprintTypeId' | 'me'>;

// ── Owned-assets overlay (3.7.7.2) ──────────────────────────────────────
// The wire shape for /api/industry/owned-assets; the client builds a
// Map<typeId, OwnedAssetEntry> keyed by the material/product type id (assets are
// the item itself, not its blueprint) to fill each node's QTY ring + asset ledger.
// A type can sit in several places / be held by several owners, so each entry
// carries a `heldBy` LIST — owner + location are resolved to names server-side.
// ownerType is the wire's own literal (the DB enum lives in the owned-assets slice,
// which a feature may not import — features never import each other).
export interface AssetHolding {
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
  quantity: number;
}

// One owned type: total on-hand quantity across every owner + location, plus the
// held-by list backing the popover.
export interface OwnedAssetEntry {
  typeId: number;
  ownedQty: number;
  heldBy: AssetHolding[];
}

// The owned-asset overlay payload: only the types the caller owns among those
// requested. Types absent from the list are un-held → the client leaves the ring
// empty + the ledger '—' (the byte-identical placeholder path). Empty for a
// logged-out caller.
export interface OwnedAssetsResponse {
  assets: OwnedAssetEntry[];
}
