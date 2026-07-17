import { gasClassRange } from './gas-classes';
import { WORMHOLE_CLASSES } from './schema';
import type { SiteListItem, SiteType, WormholeClass } from './types';

/**
 * The set of wormhole classes a site belongs to, for the /sites filter rail.
 * Most sites carry a single `wormholeClass`; gas sites have a NULL class but a
 * name-derived spawn range (gas-classes.ts), expanded here so a gas signature
 * matches any class within its range. Sites with neither (rare) match no class
 * filter — they only appear when no class is selected.
 */
export function siteClassSet(
  site: Pick<SiteListItem, 'wormholeClass' | 'siteType' | 'name'>,
): WormholeClass[] {
  if (site.wormholeClass) return [site.wormholeClass];
  if (site.siteType === 'gas') {
    const range = gasClassRange(site.name);
    if (range) {
      const min = WORMHOLE_CLASSES.indexOf(range.min);
      const max = WORMHOLE_CLASSES.indexOf(range.max);
      if (min !== -1 && max !== -1) return [...WORMHOLE_CLASSES.slice(min, max + 1)];
    }
  }
  return [];
}

// The /sites multi-select filter, as one pure predicate shared by BOTH the card
// grid and the table-row visibility effect (they used to carry hand-copied
// copies that could silently drift — AUDIT-012). Each axis is OR-within /
// AND-across: an empty axis matches everything; a non-empty class axis matches
// when the site's class set intersects the selection; a non-empty type axis
// matches when the site's type is selected.

/**
 * Class axis only — also used standalone for the per-type counts, which tally
 * against the class selection regardless of the type selection.
 */
export function matchesClassFilter(clsSet: WormholeClass[], cls: WormholeClass[]): boolean {
  return cls.length === 0 || cls.some((c) => clsSet.includes(c));
}

/**
 * A null `type` (the table reads it from a DOM attribute) matches only when no
 * type is selected.
 */
export function matchesFilter(
  site: { type: SiteType | null; clsSet: WormholeClass[] },
  selection: { cls: WormholeClass[]; types: SiteType[] },
): boolean {
  const typeOk =
    selection.types.length === 0 || (site.type != null && selection.types.includes(site.type));
  return matchesClassFilter(site.clsSet, selection.cls) && typeOk;
}
