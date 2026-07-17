import type { Tone } from '@/components/ui/tones';
import type { SecurityClass } from '@/data/eve-data/security';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import type { AttrMap } from '@/data/eve-data/types';
import type { DepthBand, PriceSource, RegionalDiscount } from '@/data/market-prices/types';

/**
 * One searchable blueprint: its own type ID, plus the type ID and name of the
 * item it builds (the product, so the search dropdown can show the product's
 * icon). Feeds the lazy Blueprints search source.
 */
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

/** One blueprint activity product with type identity and output quantity per run. */
export interface BlueprintProduct {
  typeId: number;
  name: string;
  quantityPerRun: number;
  // Whether this product's SDE category serves a 3D `render` rendition
  // (ships/drones/structures). Gates the hero image variant so a product that
  // has no render (modules, charges, materials) requests its `icon` instead of
  // 400ing on `/render`. Display-only — no bearing on any computed value.
  renderable: boolean;
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

/** Display metadata for one resolved build node, including names, categories, and image intent. */
export interface BuildNodeDisplay {
  name: string;
  height: number; // 0 for a raw leaf; 1 + tallest input otherwise
  isRaw: boolean;
  label: string; // derived in-game identifier
  tone: Tone;
}

/**
 * One node in the nested build tree. Carries only the per-occurrence facts (its
 * type and the absolute quantity one run of the final product needs);
 * everything per-type-stable is looked up from `buildNodeDisplay`.
 */
export interface BuildNode {
  typeId: number;
  quantity: number;
  inputs: BuildNode[];
}

/** A raw-material source category present in this build, with its colour. */
export interface MaterialCategoryMeta {
  label: string;
  tone: Tone;
}

/** Resolved blueprint node with activity, products, materials, and recursive build children. */
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
  // blueprintTypeId → its industry activity (1 = manufacturing, 11 = reaction),
  // for the top blueprint and every producing blueprint in the tree. The build
  // structure bonus (3.7.9.1.3) reads this to map each node to its activity's
  // structure slot (an Engineering Complex's bonus only reaches manufacturing
  // nodes; a Refinery's only reaches reaction nodes).
  nodeActivityByBlueprint: Record<number, number>;
  // blueprintTypeId → the required manufacturing skills that carry the per-item
  // time modifier (dogma attr 1982, e.g. −1%/lvl on the T2 science skills), with
  // the signed percent verbatim from the SDE and the skill's SDE name (for the
  // hero readout's applied-skills popover). Sparse: blueprints with none (all
  // T1, every reaction) are absent. The skills→time lever (skill-time.ts)
  // multiplies (1 + pct·level/100) per entry for the selected build character.
  nodeTimeSkills: Record<
    number,
    { skillTypeId: number; skillName: string; timePctPerLevel: number }[]
  >;
}

/**
 * Display-ready material cost row produced by industry planner; values retain their domain units
 * and require no additional query by the renderer.
 */
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

/**
 * A buildable intermediate's market price, carried only so the cascade can show
 * a price-confidence badge on it (a build-vs-buy liquidity hint). These are NOT
 * summed into the cost basis — the cost stays the recursed raw materials
 * (`rows`). One entry per non-raw, non-root node typeId in the build tree.
 */
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

// --- Build-structure selector (3.7.9.1.3) --------------------------------

/**
 * A structure the planner can place a build in — SOURCE-AGNOSTIC so the corp-
 * pulled source (3.7.9.1.5) slots in beside the user's custom ones with no
 * selector/wiring change. There is no per-structure "role": one selected
 * structure bonuses each build node by THAT node's activity, from the structure's
 * own attrs plus whatever rigs fit it. The resolved structure + rig dogma travels
 * on the wire so the bonus recomputes client-side, live, as the build system /
 * per-node activity change. `securityClass` is the structure's own system band for
 * a corp structure; null for a custom one (pinned or not), whose rig bonus instead
 * scales against the security of the planner's selected build LOCATION. `systemId`
 * is the structure's home system — always set for corp, set for a custom structure
 * its owner PINNED in the builder (3.7.13.2) — and makes a pick lock the build
 * location to it (isSystemLocked); null = portable, borrowing whatever system the
 * planner has selected.
 */
export interface AvailableStructure {
  id: string;
  source: 'custom' | 'corp';
  name: string;
  structureTypeId: number;
  // The structure's SDE group id (1404 Engineering Complex, 1406 Refinery, 1657
  // Citadel). Drives COVERAGE — which activities the structure can HOST, distinct
  // from the rig/role BONUS: only a Refinery (1406) hosts reactions. Resolved from
  // the structure type on the wire so the planner can gap-fill a reaction-only slot.
  groupId: number;
  systemId: number | null;
  structureAttrs: AttrMap;
  rigAttrs: AttrMap[];
  securityClass: SecurityClass | null;
  // The owner-set facility tax PERCENT (3.7.13.3): the authored completion for a
  // corp structure, the builder entry for a custom one. Null = never entered —
  // the fee path then assumes the 0.25% NPC baseline (labeled as assumed).
  taxPct: number | null;
}

/**
 * Stable industry planner outcome returned across the owning boundary; callers handle the
 * represented success, absence, or failure states.
 */
export interface AvailableStructuresResponse {
  structures: AvailableStructure[];
}

// --- Build-location selector + net margin (3.5.2b) -----------------------
// (The searchable system index — SystemSearchEntry — lives in the eve-data
// slice since 3.7.13.2: the systems search source + every picker share it.)

/**
 * One industry-capable NPC station in a system. `name` is the full in-game
 * station name (ESI-resolved); null when unresolved, so the picker falls back to
 * `operationName` (the station-operation label).
 */
export interface IndustryStationView {
  id: number;
  name: string | null;
  operationName: string;
  manufacturingCapable: boolean;
  researchCapable: boolean;
}

/**
 * Everything the client needs to compute net margin once a build system is
 * picked: its industry stations, both relevant system cost indices (null when
 * the system has no stored index — the absent-vs-0.0 distinction), and the CCP
 * adjusted prices for the product's direct ME0 base materials (EIV basis). The
 * wire shape for /api/industry/build-location.
 */
export interface BuildLocationData {
  stations: IndustryStationView[];
  costIndices: { manufacturing: number | null; reaction: number | null };
  // Carried as a list (not a Record) so the wire stays number-keyed and typed;
  // the client builds a Map. Types with no usable adjusted price are simply
  // absent (so `map.get(id) ?? null` keeps the leaf's missing-vs-0.0 honesty).
  adjustedPrices: { typeId: number; adjustedPrice: number }[];
}

/**
 * The net-margin view derived client-side once fee inputs exist (manufacturing
 * and reaction blueprints, each against its own index + tax). Null on the
 * gross-only path. Mirrors the pure leaf's NetMargin, minus the gross fields
 * already in `summary`.
 */
export interface NetMarginView {
  netMargin: number | null;
  netMarginPct: number | null;
  netCost: number | null;
  // The system cost index actually used (for the "System cost (x%)" ledger
  // label). Null when the system has no stored index.
  systemCostIndex: number | null;
  // The facility-tax FRACTION actually charged (for the "Facility tax (x%)"
  // ledger label) and whether it is the 0.25% NPC-baseline ASSUMPTION (no
  // owner-entered tax on the fee-bearing structure) rather than an entered rate.
  // 0.25% can be a real entered value, so the flag is threaded, never inferred.
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

/** Planner pricing result for one blueprint tree with row quotes and aggregate ISK totals. */
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
    // The Fuzzwork-style 5%-percentile beside the best (3.7.25.1) — the
    // reference the thin-order honesty badge compares the revenue anchor
    // against (bestSell / pct5Sell < 0.90 ⇒ "anchored by a thin order").
    pct5Sell: number | null;
    staleAfterMs: number | null;
    // Near-touch order-book depth ladders (3.5.3b), carried so the client
    // Market Score can read the product's liquidity without a second fetch.
    // Null when there's no price row / no orders on that side / Fuzzwork
    // fallback. Seeded global market data (system-agnostic), so adding it
    // doesn't bust the gross seed for blueprints with no depth — both are null.
    buyDepth: DepthBand[] | null;
    sellDepth: DepthBand[] | null;
    // Best non-hub sell opportunity (3.7.26.1) — the Sell·Jita tile's
    // opportunity callout. Null = none cleared the ingest gate; readers must
    // also tolerate `undefined` (a seed cached before the field existed).
    regionalDiscount: RegionalDiscount | null;
  };
  summary: {
    // Which cost basis inputCost/margin were computed on (the Raw|Item toggle,
    // 3.7.21.1) — carried on the summary so the UI labels can never drift from
    // the math. 'batched' = whole-run buy list; 'marginal' = consumed bill.
    basis: 'batched' | 'marginal';
    // Both bases' totals, always priced, so the input-cost popover can show
    // Raw and Item side by side whichever view is active.
    bases: { batched: number; marginal: number };
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

/**
 * One owned blueprint's effective material efficiency + readout detail, keyed by
 * blueprint type. `me` is the best ME across all the caller's copies of that
 * blueprint (resolved server-side); `te`, owner, and location describe that same
 * best copy — informational popover rows, never part of the cost compute. The wire
 * shape for /api/industry/owned-blueprints; the client builds a
 * Map\<blueprintTypeId, me\> for the cost basis and a parallel detail map for the orb.
 * ownerType is the wire's own literal (the DB enum lives in the owned-blueprints
 * slice, which a feature may not import — features never import each other).
 */
export interface OwnedBlueprintMeEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
}

/**
 * The owned-ME overlay payload: only the blueprints the caller owns among those
 * requested. Blueprints absent from the list are unowned → the client applies
 * ME0 to them (the byte-identical gross path). Empty for a logged-out caller.
 */
export interface OwnedBlueprintsResponse {
  blueprints: OwnedBlueprintMeEntry[];
}

/**
 * The readout detail for an owned component's orb popover (3.7.5.5): the best
 * owned copy's TE + owner + location. Built client-side into a
 * Map\<blueprintTypeId, …\> parallel to the ME map, and NEVER read by the cost
 * compute — purely informational rows.
 */
export type OwnedComponentDetail = Omit<OwnedBlueprintMeEntry, 'blueprintTypeId' | 'me'>;

/**
 * ── Owned-assets overlay (3.7.7.2) ──────────────────────────────────────
 * The wire shape for /api/industry/owned-assets; the client builds a
 * Map\<typeId, OwnedAssetEntry\> keyed by the material/product type id (assets are
 * the item itself, not its blueprint) to fill each node's QTY ring + asset ledger.
 * A type can sit in several places / be held by several owners, so each entry
 * carries a `heldBy` LIST — owner + location are resolved to names server-side.
 * ownerType is the wire's own literal (the DB enum lives in the owned-assets slice,
 * which a feature may not import — features never import each other).
 */
export interface AssetHolding {
  ownerType: 'character' | 'corporation';
  ownerName: string;
  locationName: string;
  locationFlag: string;
  quantity: number;
}

/**
 * One owned type: total on-hand quantity across every owner + location, plus the
 * held-by list backing the popover.
 */
export interface OwnedAssetEntry {
  typeId: number;
  ownedQty: number;
  heldBy: AssetHolding[];
}

/**
 * The owned-asset overlay payload: only the types the caller owns among those
 * requested. Types absent from the list are un-held → the client leaves the ring
 * empty + the ledger '—' (the byte-identical placeholder path). Empty for a
 * logged-out caller.
 */
export interface OwnedAssetsResponse {
  assets: OwnedAssetEntry[];
}
