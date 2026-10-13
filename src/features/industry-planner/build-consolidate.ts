import type { Tone } from '@/components/ui/tones';
import { getOrInsertComputed } from '@/lib/array';
import type { BatchLedger } from './build-batch';
import { typeName } from './type-name';
import type { BlueprintStructure, BuildNode } from './types';

export interface ConsolidatedItem {
  typeId: number;
  name: string;
  label: string;
  tone: Tone;
  isRaw: boolean;
  quantity: number;
  hasChildren: boolean;
}

export interface ConsolidatedTier {
  depth: number;
  items: ConsolidatedItem[];
}

export interface ConsolidatedBuild {
  tiers: ConsolidatedTier[];
  descendants: Map<number, Set<number>>;
  childrenOf: Map<number, Set<number>>;
}

export function consolidateBuild(structure: BlueprintStructure): ConsolidatedBuild {
  const { buildTree, buildNodeDisplay } = structure;

  const childrenOf = new Map<number, Set<number>>();
  const byDepth = new Map<number, Map<number, number>>();

  const walk = (node: BuildNode, depth: number) => {
    const kids = getOrInsertComputed(childrenOf, node.typeId, () => new Set());
    for (const input of node.inputs) kids.add(input.typeId);

    if (depth > 0) {
      const tier = getOrInsertComputed(byDepth, depth, () => new Map());
      tier.set(node.typeId, (tier.get(node.typeId) ?? 0) + node.quantity);
    }
    for (const input of node.inputs) walk(input, depth + 1);
  };
  for (const root of buildTree) walk(root, 0);

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
      name: typeName(structure, typeId),
      label: d?.label ?? '',
      tone: d?.tone ?? 'neutral',
      isRaw: d?.isRaw ?? true,
      hasChildren: (childrenOf.get(typeId)?.size ?? 0) > 0,
    };
  };

  const tiers: ConsolidatedTier[] = [...byDepth.keys()]
    .sort((a, b) => a - b)
    .map((depth) => ({
      depth,
      items: [...byDepth.get(depth)!.entries()]
        .map(([typeId, qty]) => toItem(typeId, qty))
        .sort(
          (a, b) =>
            Number(a.isRaw) - Number(b.isRaw) ||
            a.label.localeCompare(b.label) ||
            a.name.localeCompare(b.name),
        ),
    }));

  return { tiers, descendants, childrenOf };
}

export function scaleTiersToBatched(
  tiers: ConsolidatedTier[],
  ledger: BatchLedger,
): ConsolidatedTier[] {
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
      const quantity = mt > 0 ? (item.quantity / mt) * batchedTotalOf(item) : 0;
      return { ...item, quantity };
    }),
  }));
}
