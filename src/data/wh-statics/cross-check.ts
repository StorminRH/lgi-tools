import type { WormholeCodexAsset } from '@/data/eve-data/universe-assets';
import type { StaticsEntry } from './parse';
import type { LineageRow } from './lineage';

/** One system where the feed's type set disagrees with the Pathfinder lineage. */
export type StaticsDisagreement = {
  systemId: number;
  feedTypeIds: number[];
  lineageTypeIds: number[];
};

/** Result of the three-way feed ↔ codex ↔ lineage cross-check. */
export type StaticsCrossCheck = {
  agreedSystems: number;
  disagreements: StaticsDisagreement[];
  lineageOnlySystems: number[];
  feedOnlySystems: number[];
};

/**
 * Thrown when a feed static code has no entry in the shipped wormhole codex.
 * This is a hard parse failure, not a soft disagreement.
 */
export class UnresolvableCodexCodeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`Wormhole code ${code} has no entry in the shipped wormhole codex`);
    this.name = 'UnresolvableCodexCodeError';
    this.code = code;
  }
}

function sortedUnique(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function groupTypeIdsBySystem(
  pairs: readonly { systemId: number; typeId: number }[],
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const pair of pairs) {
    const bucket = map.get(pair.systemId);
    if (bucket) bucket.push(pair.typeId);
    else map.set(pair.systemId, [pair.typeId]);
  }
  return map;
}

function resolveFeedTypeIds(
  entries: readonly StaticsEntry[],
  codeToTypeId: ReadonlyMap<string, number>,
): Map<number, number[]> {
  const pairs: { systemId: number; typeId: number }[] = [];
  for (const entry of entries) {
    const typeId = codeToTypeId.get(entry.code);
    if (typeId === undefined) {
      throw new UnresolvableCodexCodeError(entry.code);
    }
    pairs.push({ systemId: entry.systemId, typeId });
  }
  return groupTypeIdsBySystem(pairs);
}

function compareOverlappingSystems(
  feedBySystem: ReadonlyMap<number, number[]>,
  lineageBySystem: ReadonlyMap<number, number[]>,
): Pick<StaticsCrossCheck, 'agreedSystems' | 'disagreements'> {
  const disagreements: StaticsDisagreement[] = [];
  let agreedSystems = 0;

  for (const systemId of sortedUnique(feedBySystem.keys())) {
    const lineageTypes = lineageBySystem.get(systemId);
    if (lineageTypes === undefined) continue;
    const feedTypeIds = sortedUnique(feedBySystem.get(systemId) ?? []);
    const lineageTypeIds = sortedUnique(lineageTypes);
    if (sameSet(feedTypeIds, lineageTypeIds)) {
      agreedSystems += 1;
    } else {
      disagreements.push({ systemId, feedTypeIds, lineageTypeIds });
    }
  }

  return { agreedSystems, disagreements };
}

/**
 * Resolves each feed entry's code to a typeId through the wormhole codex and
 * compares per-system type sets against the Pathfinder lineage. Disagreements
 * are surfaced, never auto-resolved. Throws when a code has no codex entry.
 */
export function crossCheckStatics(
  entries: readonly StaticsEntry[],
  lineageRows: readonly LineageRow[],
  codex: WormholeCodexAsset,
): StaticsCrossCheck {
  const codeToTypeId = new Map(
    codex.types.map((entry) => [entry.code, entry.typeId] as const),
  );
  const feedBySystem = resolveFeedTypeIds(entries, codeToTypeId);
  const lineageBySystem = groupTypeIdsBySystem(lineageRows);

  const feedSystems = new Set(feedBySystem.keys());
  const lineageSystems = new Set(lineageBySystem.keys());
  const overlap = compareOverlappingSystems(feedBySystem, lineageBySystem);

  return {
    ...overlap,
    lineageOnlySystems: sortedUnique(
      [...lineageSystems].filter((systemId) => !feedSystems.has(systemId)),
    ),
    feedOnlySystems: sortedUnique(
      [...feedSystems].filter((systemId) => !lineageSystems.has(systemId)),
    ),
  };
}
