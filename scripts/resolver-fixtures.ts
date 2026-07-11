// Pure, import-safe canonicalisation + comparison helpers for the resolver-output
// validation gate (scripts/validate-resolver-output.ts). No dotenv, no db, no
// side effects — the entry owns the reads, the console output, and process.exit;
// this module owns the deterministic shaping and the diff so they can be unit
// tested. Type-only imports are erased, so nothing here reaches the DB layer.

import type { TreeNode } from '@/data/eve-data/tree-resolver';

// ---- Canonicalisation ----------------------------------------------

// Deterministic JSON with recursively sorted object keys; array order preserved
// (callers pre-sort arrays whose order is not meaningful).
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// Sort a tree's nodes (and every nested inputs[] array) by typeId so sibling
// order from the source row stream doesn't register as a difference.
export function sortTree(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .map((n) => ({ ...n, inputs: sortTree(n.inputs) }))
    .sort((a, b) => a.typeId - b.typeId);
}

// ---- Compare -------------------------------------------------------

// Canonicalise both sides and report equality plus the two strings, with no
// console output and no counter mutation — the entry's compare() wrapper logs and
// tallies failures.
export function compareCanonical(
  expected: unknown,
  actual: unknown,
): { equal: boolean; expected: string; actual: string } {
  const e = stableStringify(expected);
  const a = stableStringify(actual);
  return { equal: e === a, expected: e, actual: a };
}

// ---- Flat-material grouping ----------------------------------------

type FlatMap = Record<string, number>; // rawTypeId(string) -> qty

// Group resolved flat-material rows into per-blueprint maps, keyed by the
// reference name. Every reference blueprint appears in the output (empty map when
// it has no rows). Pure — the entry does the DB read and passes the rows in.
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
