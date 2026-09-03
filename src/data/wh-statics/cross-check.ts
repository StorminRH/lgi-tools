import type { WormholeCodexAsset } from '@/data/eve-data/universe-assets';
import type { PathfinderStaticRow } from './lineage';
import type {
  WhStaticEntry,
  WhStaticsCrossCheck,
  WhStaticsDisagreement,
} from './schema';

export class UnknownCodexStaticError extends Error {

  constructor(code: string) {
    super(`Wormhole codex has no type for static code ${code}`);
    this.name = 'UnknownCodexStaticError';
  }
}

export class UnknownLineageTypeError extends Error {

  constructor(typeId: number) {
    super(`Wormhole codex has no code for Pathfinder type ${typeId}`);
    this.name = 'UnknownLineageTypeError';
  }
}

function addToSystemSet(
  target: Map<number, Set<string>>,
  systemId: number,
  code: string,
): void {
  const values = target.get(systemId) ?? new Set<string>();
  values.add(code);
  target.set(systemId, values);
}

function sortedValues(values: ReadonlySet<string>): string[] {
  return [...values].sort();
}

function equalSets(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function crossCheckStatics(
  entries: readonly WhStaticEntry[],
  lineageRows: readonly PathfinderStaticRow[],
  codex: WormholeCodexAsset,
): WhStaticsCrossCheck {
  const knownCodes = new Set(codex.types.map((entry) => entry.code));
  const codeByTypeId = new Map(
    codex.types.map((entry) => [entry.typeId, entry.code]),
  );
  const feedBySystem = new Map<number, Set<string>>();
  for (const entry of entries) {
    if (!knownCodes.has(entry.code)) {
      throw new UnknownCodexStaticError(entry.code);
    }
    addToSystemSet(feedBySystem, entry.systemId, entry.code);
  }
  const lineageBySystem = new Map<number, Set<string>>();
  for (const row of lineageRows) {
    const code = codeByTypeId.get(row.typeId);
    if (code === undefined) throw new UnknownLineageTypeError(row.typeId);
    addToSystemSet(lineageBySystem, row.systemId, code);
  }

  let agreedSystems = 0;
  const disagreements: WhStaticsDisagreement[] = [];
  const lineageOnlySystems: number[] = [];
  const feedOnlySystems: number[] = [];
  const systemIds = new Set([
    ...feedBySystem.keys(),
    ...lineageBySystem.keys(),
  ]);
  for (const systemId of [...systemIds].sort((left, right) => left - right)) {
    const feed = feedBySystem.get(systemId);
    const lineage = lineageBySystem.get(systemId);
    if (feed === undefined) {
      lineageOnlySystems.push(systemId);
    } else if (lineage === undefined) {
      feedOnlySystems.push(systemId);
    } else if (equalSets(feed, lineage)) {
      agreedSystems += 1;
    } else {
      disagreements.push({
        systemId,
        feedCodes: sortedValues(feed),
        lineageCodes: sortedValues(lineage),
      });
    }
  }
  return {
    agreedSystems,
    disagreements,
    lineageOnlySystems,
    feedOnlySystems,
  };
}
