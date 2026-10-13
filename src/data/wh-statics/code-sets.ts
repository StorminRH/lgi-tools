import { getOrInsertComputed, sortedUniqueIds } from '@/lib/array';

export interface SystemCode {
  readonly systemId: number;
  readonly code: string;
}

/**
 * One system in the union of two code maps. Systems come in ascending numeric
 * id order and code lists in default `[...set].sort()` order, because both
 * feed jsonb that is persisted on wh_statics_snapshots.
 */
export type SystemCodeComparison =
  | { readonly kind: 'left-only'; readonly systemId: number; readonly left: readonly string[] }
  | { readonly kind: 'right-only'; readonly systemId: number; readonly right: readonly string[] }
  | { readonly kind: 'equal'; readonly systemId: number }
  | {
      readonly kind: 'different';
      readonly systemId: number;
      readonly left: readonly string[];
      readonly right: readonly string[];
    };

export function codesBySystem(pairs: Iterable<SystemCode>): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const { systemId, code } of pairs) {
    getOrInsertComputed(result, systemId, () => new Set()).add(code);
  }
  return result;
}

function sortedCodes(codes: ReadonlySet<string>): string[] {
  return [...codes].sort();
}

function sameCodes(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((code) => right.has(code));
}

export function compareSystemCodes(
  left: ReadonlyMap<number, ReadonlySet<string>>,
  right: ReadonlyMap<number, ReadonlySet<string>>,
): SystemCodeComparison[] {
  return sortedUniqueIds([...left.keys(), ...right.keys()]).map((systemId) => {
    const leftCodes = left.get(systemId);
    const rightCodes = right.get(systemId);
    if (leftCodes === undefined) {
      return { kind: 'right-only', systemId, right: sortedCodes(rightCodes!) };
    }
    if (rightCodes === undefined) {
      return { kind: 'left-only', systemId, left: sortedCodes(leftCodes) };
    }
    if (sameCodes(leftCodes, rightCodes)) return { kind: 'equal', systemId };
    return {
      kind: 'different',
      systemId,
      left: sortedCodes(leftCodes),
      right: sortedCodes(rightCodes),
    };
  });
}
