import type { StaticsEntry } from './parse';

/** One system whose static code set changed between promoted and incoming. */
export type StaticsSystemChange = {
  systemId: number;
  before: string[];
  after: string[];
};

/**
 * Pure difference between the promoted serving copy and an incoming normalized
 * feed. `totalDifferences === 0` is the nothing-to-review signal.
 */
export type StaticsDiff = {
  systemsAdded: number[];
  systemsRemoved: number[];
  systemsChanged: StaticsSystemChange[];
  codesAdded: string[];
  codesRemoved: string[];
  totalDifferences: number;
};

function toSystemMap(
  entries: readonly Pick<StaticsEntry, 'systemId' | 'code'>[],
): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const entry of entries) {
    const bucket = map.get(entry.systemId);
    if (bucket) bucket.add(entry.code);
    else map.set(entry.systemId, new Set([entry.code]));
  }
  return map;
}

function sorted(values: Iterable<string | number>): (string | number)[] {
  return [...values].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });
}

function sameCodes(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const code of a) {
    if (!b.has(code)) return false;
  }
  return true;
}

/**
 * Computes the difference between the promoted copy and an incoming feed.
 * Pure: no I/O. Counts systems added/removed/changed and the code vocabulary
 * delta; `totalDifferences` is the review-gate signal.
 */
export function diffStatics(
  promoted: readonly Pick<StaticsEntry, 'systemId' | 'code'>[],
  incoming: readonly Pick<StaticsEntry, 'systemId' | 'code'>[],
): StaticsDiff {
  const before = toSystemMap(promoted);
  const after = toSystemMap(incoming);

  const systemsAdded: number[] = [];
  const systemsRemoved: number[] = [];
  const systemsChanged: StaticsSystemChange[] = [];
  const codesBefore = new Set<string>();
  const codesAfter = new Set<string>();

  for (const codes of before.values()) {
    for (const code of codes) codesBefore.add(code);
  }
  for (const codes of after.values()) {
    for (const code of codes) codesAfter.add(code);
  }

  for (const systemId of sorted(before.keys()) as number[]) {
    if (!after.has(systemId)) systemsRemoved.push(systemId);
  }
  for (const systemId of sorted(after.keys()) as number[]) {
    if (!before.has(systemId)) {
      systemsAdded.push(systemId);
      continue;
    }
    const beforeCodes = before.get(systemId)!;
    const afterCodes = after.get(systemId)!;
    if (!sameCodes(beforeCodes, afterCodes)) {
      systemsChanged.push({
        systemId,
        before: sorted(beforeCodes) as string[],
        after: sorted(afterCodes) as string[],
      });
    }
  }

  const codesAdded = sorted(
    [...codesAfter].filter((code) => !codesBefore.has(code)),
  ) as string[];
  const codesRemoved = sorted(
    [...codesBefore].filter((code) => !codesAfter.has(code)),
  ) as string[];

  const totalDifferences =
    systemsAdded.length +
    systemsRemoved.length +
    systemsChanged.length +
    codesAdded.length +
    codesRemoved.length;

  return {
    systemsAdded,
    systemsRemoved,
    systemsChanged,
    codesAdded,
    codesRemoved,
    totalDifferences,
  };
}
