import type { TreeNode } from '@/data/eve-data/tree-resolver';

// The multibuy export's presentation layer (3.7.22.1): the tier cut behind the
// panel's checkboxes, the deterministic line order, and the in-game clipboard
// string. Pure — the demand cascade lives in build-batch.ts
// (computeMultibuyDemand); this module only shapes its result for the user.

// Each BUILDABLE type's one home tier = its minimum occurrence depth (roots =
// depth 1, matching the build plan's "Tier N" columns — the first column the
// user sees the item in). The displayed tiers repeat a type at every depth it's
// consumed at, so they don't partition types; the checkboxes need a partition,
// and min-depth is the cut with a visual anchor. Raws are never assigned — the
// export always buys them.
export function assignBuildTiers(tree: TreeNode[]): Map<number, number> {
  const tiers = new Map<number, number>();
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (!node.producedBy) continue; // raw leaf — never assigned
      const prev = tiers.get(node.typeId);
      if (prev === undefined || depth < prev) tiers.set(node.typeId, depth);
      walk(node.inputs, depth + 1);
    }
  };
  walk(tree, 1);
  return tiers;
}

export interface MultibuyEntry {
  name: string;
  qty: number;
}

// Buy map → a deterministic entry list: bought intermediates first (ascending
// home tier, then name), the raw frontier last (by name) — so the pasted list
// reads top-down like the build plan.
export function multibuyEntries(
  buy: Map<number, number>,
  nameOf: (typeId: number) => string,
  tierOf: (typeId: number) => number | undefined,
): MultibuyEntry[] {
  return [...buy]
    .map(([typeId, qty]) => ({ name: nameOf(typeId), qty, tier: tierOf(typeId) ?? Infinity }))
    .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.name.localeCompare(b.name)))
    .map(({ name, qty }) => ({ name, qty }));
}

// The in-game multibuy clipboard string: one `Name<TAB>qty` line per material,
// newline-joined with no trailing newline. The game parses any whitespace
// delimiter but NOT thousand separators ("20,000" reads as 20), so quantities
// are plain integer digits — ceiled defensively (the cascade already emits
// integers) and zero-quantity lines dropped. Quantity trails the name because
// names can START with digits ("1MN Afterburner II").
export function buildMultibuyText(entries: MultibuyEntry[]): string {
  return entries
    .map(({ name, qty }) => ({ name, qty: Math.ceil(qty) }))
    .filter(({ qty }) => qty > 0)
    .map(({ name, qty }) => `${name}\t${String(qty)}`)
    .join('\n');
}
