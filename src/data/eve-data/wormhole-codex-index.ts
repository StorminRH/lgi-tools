import type { WormholeCodexEntry } from './universe-assets';

/**
 * Code lookup over the wormhole codex. The SDE ships clone clusters (several
 * typeIds for one code); the lowest typeId speaks for the code, the same rule
 * buildWormholeEffects applies to effect beacons.
 */
export interface WormholeCodexIndex {
  /** The lowest-typeId entry for the code, or null when the codex lacks it. */
  byCode(code: string): WormholeCodexEntry | null;
  /** Every code once, sorted. */
  readonly codes: readonly string[];
  /** Codes whose clones disagree on far side, mass, lifetime, size or target class. */
  readonly conflictingCodes: ReadonlySet<string>;
}

function sameCodeMeaning(
  left: WormholeCodexEntry,
  right: WormholeCodexEntry,
): boolean {
  if (left.farSide !== right.farSide) return false;
  if (left.farSide) return true;
  if (right.farSide) return false;
  return left.totalMass === right.totalMass
    && left.maxJumpMass === right.maxJumpMass
    && left.massRegen === right.massRegen
    && left.lifetimeMinutes === right.lifetimeMinutes
    && left.sizeClass === right.sizeClass
    && left.targetClass === right.targetClass;
}

export function indexWormholeCodex(
  entries: readonly WormholeCodexEntry[],
): WormholeCodexIndex {
  const entryByCode = new Map<string, WormholeCodexEntry>();
  const conflictingCodes = new Set<string>();
  for (const entry of entries) {
    const existing = entryByCode.get(entry.code);
    if (existing === undefined) {
      entryByCode.set(entry.code, entry);
      continue;
    }
    if (!sameCodeMeaning(existing, entry)) conflictingCodes.add(entry.code);
    if (entry.typeId < existing.typeId) entryByCode.set(entry.code, entry);
  }
  return {
    byCode(code) {
      return entryByCode.get(code) ?? null;
    },
    codes: [...entryByCode.keys()].toSorted(),
    conflictingCodes,
  };
}
