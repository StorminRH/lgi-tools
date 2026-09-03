import type { TreeNode } from '@/data/eve-data/tree-resolver';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function sortTree(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .map((n) => ({ ...n, inputs: sortTree(n.inputs) }))
    .sort((a, b) => a.typeId - b.typeId);
}

export function compareCanonical(
  expected: unknown,
  actual: unknown,
): { equal: boolean; expected: string; actual: string } {
  const e = stableStringify(expected);
  const a = stableStringify(actual);
  return { equal: e === a, expected: e, actual: a };
}

export type FlatMap = Record<string, number>;

export function groupFlatByBlueprint(
  rows: { blueprintTypeId: number; rawMaterialTypeId: number; totalQuantity: number | string | bigint }[],
  reference: Record<string, number>,
): Record<string, FlatMap> {
  const byBlueprint = new Map<number, FlatMap>();
  for (const r of rows) {
    const map = byBlueprint.get(r.blueprintTypeId) ?? {};
    map[String(r.rawMaterialTypeId)] = Number(r.totalQuantity);
    byBlueprint.set(r.blueprintTypeId, map);
  }
  const out: Record<string, FlatMap> = {};
  for (const [name, bpId] of Object.entries(reference)) {
    out[name] = byBlueprint.get(bpId) ?? {};
  }
  return out;
}
