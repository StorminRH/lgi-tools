import type { Npc, SiteDetail, Wave } from './types';

/** An EWAR effect a sleeper can field, keyed as its pill is. */
export type EwarKey = 'web' | 'scram' | 'neut' | 'rr';

/** One count per EWAR effect. Null means nothing was recorded for it. */
export type EwarCounts = Record<EwarKey, number | null>;

/** The order EWAR pills are shown in. */
const EWAR_ORDER: readonly EwarKey[] = ['web', 'scram', 'neut', 'rr'];

/**
 * An NPC row's EWAR, keyed as the pills are. The row keeps mergeNpc's
 * convention: scram is the raw count, web is 0 or 1, neut is negative.
 */
export function npcEwar(npc: Npc): EwarCounts {
  return { web: npc.web, scram: npc.scram, neut: npc.neut, rr: npc.rrep };
}

/** A wave's EWAR fields, keyed as the pills are. */
export function waveEwarCounts(wave: Wave): EwarCounts {
  return { web: wave.ewWeb, scram: wave.ewScram, neut: wave.ewNeut, rr: wave.ewRrep };
}

/** Sums each EWAR count across items. A null count adds nothing. */
function sumEwar<T>(items: readonly T[], countsOf: (item: T) => EwarCounts): Record<EwarKey, number> {
  const totals: Record<EwarKey, number> = { web: 0, scram: 0, neut: 0, rr: 0 };
  for (const item of items) {
    const counts = countsOf(item);
    for (const key of EWAR_ORDER) totals[key] += counts[key] ?? 0;
  }
  return totals;
}

/** A zero total (-0 included) means nothing fields the effect: a wave stores null. */
function zeroToNull(total: number): number | null {
  return total || null;
}

/**
 * A wave's EWAR: the sum of each field over its NPC rows, null when no row
 * fields it. Quantity is ignored: a row's counts are added once, not once per
 * ship. Rows without combat stats (all null) add nothing.
 */
export function waveEwar(
  npcs: readonly Npc[],
): Pick<Wave, 'ewScram' | 'ewWeb' | 'ewNeut' | 'ewRrep'> {
  const totals = sumEwar(npcs, npcEwar);
  return {
    ewScram: zeroToNull(totals.scram),
    ewWeb: zeroToNull(totals.web),
    ewNeut: zeroToNull(totals.neut),
    ewRrep: zeroToNull(totals.rr),
  };
}

/** A site's EWAR summed across its waves, a null wave field counting as 0. */
export function siteEwarTotals(site: Pick<SiteDetail, 'waves'>): Record<EwarKey, number> {
  return sumEwar(site.waves, waveEwarCounts);
}

/** The EWAR keys with a non-zero count, in pill order. */
export function activeEwarKeys(counts: EwarCounts): EwarKey[] {
  return EWAR_ORDER.filter((key) => (counts[key] ?? 0) !== 0);
}
