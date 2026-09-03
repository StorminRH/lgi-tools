import type { TreeNode } from '@/data/eve-data/tree-resolver';

export type NetMode = 'Total' | 'Remaining';

export function assignBuildTiers(tree: TreeNode[]): Map<number, number> {
  const tiers = new Map<number, number>();
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (!node.producedBy) continue;
      const prev = tiers.get(node.typeId);
      if (prev === undefined || depth < prev) tiers.set(node.typeId, depth);
      walk(node.inputs, depth + 1);
    }
  };
  walk(tree, 1);
  return tiers;
}

export function tierRowsFromTierOf(tierOf: Map<number, number>): [number, number][] {
  const counts = new Map<number, number>();
  for (const depth of tierOf.values()) counts.set(depth, (counts.get(depth) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a - b);
}

export function multibuyBuildSet(
  tierOf: Map<number, number>,
  uncheckedTiers: ReadonlySet<number>,
): Set<number> {
  const buildSet = new Set<number>();
  for (const [typeId, depth] of tierOf) if (!uncheckedTiers.has(depth)) buildSet.add(typeId);
  return buildSet;
}

export function hasOwnedStock(ownedAssets: { size: number } | null): boolean {
  return (ownedAssets?.size ?? 0) > 0;
}

export function pluralCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export interface MultibuyEntry {
  name: string;
  qty: number;
}

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

export function buildMultibuyText(entries: MultibuyEntry[]): string {
  return entries
    .map(({ name, qty }) => ({ name, qty: Math.ceil(qty) }))
    .filter(({ qty }) => qty > 0)
    .map(({ name, qty }) => `${name}\t${String(qty)}`)
    .join('\n');
}
