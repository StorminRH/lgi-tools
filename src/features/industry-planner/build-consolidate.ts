import type { Tone } from '@/components/ui/tones';
import type { BatchLedger } from './build-batch';
import type { BlueprintStructure, BuildNode } from './types';

// Collapse the recursive build tree into a consolidated, by-depth view: each
// tier is a build step below the product (tier 1 = the product's direct inputs,
// tier 2 = everything those consume, …), and within a tier every unique type —
// buildable OR raw — appears once with its quantity summed across that depth.
// A raw consumed at more than one depth shows its per-tier amount in each tier;
// those still sum to its grand total in the cost ledger. Also returns each
// buildable's transitive downstream requirements, so the UI can light up a
// single component's whole chain across the tiers.

export interface ConsolidatedItem {
  typeId: number;
  name: string;
  label: string;
  tone: Tone;
  isRaw: boolean;
  // Total quantity consumed at this tier across one run of the final product.
  quantity: number;
  // Whether this item has its own inputs (a further build step you can isolate).
  hasChildren: boolean;
}

export interface ConsolidatedTier {
  // Build step below the product (1 = the product's direct inputs).
  depth: number;
  items: ConsolidatedItem[];
}

export interface ConsolidatedBuild {
  // Ordered product-side → raw-side (tier 1 first).
  tiers: ConsolidatedTier[];
  // typeId → every type downstream of it (its full requirement chain).
  descendants: Map<number, Set<number>>;
  // typeId → its DIRECT inputs only. Lets a consumer walk one item's subtree by
  // relative depth (which `descendants` flattens away) — needed to light a
  // focused item's chain at the right tier, since the same type can be consumed
  // at several depths across the whole build.
  childrenOf: Map<number, Set<number>>;
}

export function consolidateBuild(structure: BlueprintStructure): ConsolidatedBuild {
  const { buildTree, buildNodeDisplay } = structure;

  const childrenOf = new Map<number, Set<number>>();
  // depth (build step below the product) → (typeId → summed quantity)
  const byDepth = new Map<number, Map<number, number>>();

  const walk = (node: BuildNode, depth: number) => {
    let kids = childrenOf.get(node.typeId);
    if (!kids) {
      kids = new Set();
      childrenOf.set(node.typeId, kids);
    }
    for (const input of node.inputs) kids.add(input.typeId);

    // Consolidate this occurrence at its depth (skip the product root at 0).
    if (depth > 0) {
      let tier = byDepth.get(depth);
      if (!tier) {
        tier = new Map();
        byDepth.set(depth, tier);
      }
      tier.set(node.typeId, (tier.get(node.typeId) ?? 0) + node.quantity);
    }
    for (const input of node.inputs) walk(input, depth + 1);
  };
  for (const root of buildTree) walk(root, 0);

  // Transitive downstream requirements per type. The build graph is a strict
  // DAG (the resolver drops degenerate self-edges and throws on any cycle), so
  // memoising each type's set once is safe.
  const descendants = new Map<number, Set<number>>();
  const collect = (typeId: number): Set<number> => {
    const cached = descendants.get(typeId);
    if (cached) return cached;
    const acc = new Set<number>();
    descendants.set(typeId, acc);
    for (const child of childrenOf.get(typeId) ?? []) {
      acc.add(child);
      for (const deep of collect(child)) acc.add(deep);
    }
    return acc;
  };
  for (const typeId of childrenOf.keys()) collect(typeId);

  const toItem = (typeId: number, quantity: number): ConsolidatedItem => {
    const d = buildNodeDisplay[typeId];
    return {
      typeId,
      quantity,
      name: d?.name ?? structure.materialNames[typeId] ?? `Type ${typeId}`,
      label: d?.label ?? '',
      tone: d?.tone ?? 'neutral',
      isRaw: d?.isRaw ?? true,
      hasChildren: (childrenOf.get(typeId)?.size ?? 0) > 0,
    };
  };

  const tiers: ConsolidatedTier[] = [...byDepth.keys()]
    .sort((a, b) => a - b) // tier 1 (closest to the product) first
    .map((depth) => ({
      depth,
      items: [...byDepth.get(depth)!.entries()]
        .map(([typeId, qty]) => toItem(typeId, qty))
        // Buildables first (a further step), then by type, then alphabetical.
        .sort(
          (a, b) =>
            Number(a.isRaw) - Number(b.isRaw) ||
            a.label.localeCompare(b.label) ||
            a.name.localeCompare(b.name),
        ),
    }));

  return { tiers, descendants, childrenOf };
}

/**
 * The focused item's downstream chain, indexed by depth RELATIVE to the focus
 * (0 = the focused item, 1 = its direct inputs, 2 = theirs, …). Walking
 * `childrenOf` from the focus keeps each level to the types actually consumed at
 * that step of THIS item's subtree — unlike a flat descendant set, which would
 * also match a type that sits at this depth elsewhere in the build (e.g. a
 * mineral a sibling capital part consumes directly). Shared by the consolidated
 * tier views so a focused component lights its chain at the right tier.
 */
export function chainLevelsFrom(
  rootTypeId: number,
  childrenOf: Map<number, Set<number>>,
): Map<number, Set<number>> {
  const levels = new Map<number, Set<number>>();
  levels.set(0, new Set([rootTypeId]));
  for (let k = 1; ; k += 1) {
    const next = new Set<number>();
    for (const parentId of levels.get(k - 1)!) {
      for (const child of childrenOf.get(parentId) ?? []) next.add(child);
    }
    if (next.size === 0) break;
    levels.set(k, next);
  }
  return levels;
}

/**
 * Re-base the consolidated tiers from the resolver's MARGINAL (fractional-run)
 * quantities onto the WHOLE-RUN batch totals, so the columns read what a builder
 * actually makes/buys. Placement is untouched (a type stays in every tier it's
 * consumed at) — only the number changes. Each type's whole-run total is split
 * across the tiers it appears in IN PROPORTION to its marginal share there, so:
 *   • a type's per-tier cells still SUM to its whole-run total (shared
 *     sub-components counted once — the build-batch aggregate-then-ceil);
 *   • a type consumed at a single tier shows its full batch (e.g. a component
 *     needed 150 at a 100/run batch reads 200, two whole runs);
 *   • a type split across tiers keeps its split (possibly sub-unit, as before).
 * `runs` is already baked into the batch totals, so callers render the cell
 * quantity directly — no further × runs.
 *
 * Whole-run total per type: raws → the leaf total you buy; buildables → produced
 * (`runs × batch`). Pure — takes the consolidated tiers and a precomputed ledger
 * (`computeBatchLedger(structure.tree, runs)`), returns fresh tiers.
 */
export function scaleTiersToBatched(
  tiers: ConsolidatedTier[],
  ledger: BatchLedger,
): ConsolidatedTier[] {
  // A type's marginal demand summed across every tier it appears in (the
  // denominator of its proportional split).
  const marginalTotal = new Map<number, number>();
  for (const tier of tiers) {
    for (const item of tier.items) {
      marginalTotal.set(item.typeId, (marginalTotal.get(item.typeId) ?? 0) + item.quantity);
    }
  }

  const batchedTotalOf = (item: ConsolidatedItem): number => {
    if (item.isRaw) return ledger.raws.get(item.typeId) ?? 0;
    const b = ledger.builds.get(item.typeId);
    return b ? b.runs * b.batch : 0;
  };

  return tiers.map((tier) => ({
    depth: tier.depth,
    items: tier.items.map((item) => {
      const mt = marginalTotal.get(item.typeId) ?? 0;
      // This tier's share of the type's marginal demand, applied to its whole-run
      // total. Guard a zero marginal (no demand → no batched quantity).
      const quantity = mt > 0 ? (item.quantity / mt) * batchedTotalOf(item) : 0;
      return { ...item, quantity };
    }),
  }));
}
