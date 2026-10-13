import type { WormholeCodexAsset } from '@/data/eve-data/universe-assets';
import { codesBySystem, compareSystemCodes } from './code-sets';
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

export function crossCheckStatics(
  entries: readonly WhStaticEntry[],
  lineageRows: readonly PathfinderStaticRow[],
  codex: WormholeCodexAsset,
): WhStaticsCrossCheck {
  const knownCodes = new Set(codex.types.map((entry) => entry.code));
  const codeByTypeId = new Map(
    codex.types.map((entry) => [entry.typeId, entry.code]),
  );
  for (const entry of entries) {
    if (!knownCodes.has(entry.code)) {
      throw new UnknownCodexStaticError(entry.code);
    }
  }
  const lineage = lineageRows.map((row) => {
    const code = codeByTypeId.get(row.typeId);
    if (code === undefined) throw new UnknownLineageTypeError(row.typeId);
    return { systemId: row.systemId, code };
  });

  let agreedSystems = 0;
  const disagreements: WhStaticsDisagreement[] = [];
  const lineageOnlySystems: number[] = [];
  const feedOnlySystems: number[] = [];
  for (const comparison of compareSystemCodes(codesBySystem(entries), codesBySystem(lineage))) {
    if (comparison.kind === 'left-only') {
      feedOnlySystems.push(comparison.systemId);
    } else if (comparison.kind === 'right-only') {
      lineageOnlySystems.push(comparison.systemId);
    } else if (comparison.kind === 'equal') {
      agreedSystems += 1;
    } else {
      disagreements.push({
        systemId: comparison.systemId,
        feedCodes: comparison.left,
        lineageCodes: comparison.right,
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
