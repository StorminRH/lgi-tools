import { gasClassRange } from './gas-classes';
import type { SiteDetail, WormholeClass } from './types';

/**
 * Closed, canonically ordered set of sortable keys; consumers derive validation, unions, and
 * iteration from this one list.
 */
export const SORTABLE_KEYS = [
  'name',
  'type',
  'isk',
  'blueLoot',
  'scrams',
  'class',
] as const;

/**
 * Canonical identifier used by wormhole sites; consumers must not infer additional identity
 * semantics from its storage representation.
 */
export type SortableKey = (typeof SORTABLE_KEYS)[number];
/** Closed ascending or descending catalogue sort direction. */
export type SortDir = 'asc' | 'desc';

const TYPE_ORDER: Record<SiteDetail['siteType'], number> = {
  combat: 0, ore: 1, gas: 2, relic: 3, data: 4,
};

const CLASS_ORDER: Record<WormholeClass, number> = {
  C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6,
};

/**
 * Interprets sort key using the canonical wormhole sites rules. Invalid input is reported as
 * absence for the caller to handle.
 */
export function parseSortKey(raw: string | undefined): SortableKey | null {
  if (!raw) return null;
  return (SORTABLE_KEYS as readonly string[]).includes(raw) ? (raw as SortableKey) : null;
}

/**
 * Interprets sort dir using the canonical wormhole sites rules. Invalid input is normalized to the
 * module's documented fallback.
 */
export function parseSortDir(raw: string | undefined): SortDir {
  return raw === 'asc' ? 'asc' : 'desc';
}

/**
 * Returns the column's default direction (the one the URL gets the first time
 * a user clicks the header). Numeric columns descend by default — biggest
 * first. String + categorical-rank columns (name, type, class) ascend, since
 * "data → combat" or "C6 → C1" on first click is counter-intuitive.
 */
export function defaultDirFor(key: SortableKey): SortDir {
  if (key === 'name' || key === 'type' || key === 'class') return 'asc';
  return 'desc';
}

function siteIskValue(s: SiteDetail): number | null {
  const isWaveDriven = s.siteType === 'combat' || s.siteType === 'relic' || s.siteType === 'data';
  return isWaveDriven ? s.blueLootIsk : s.resourceValueIsk;
}

/**
 * Total scram NPC count across the site, summed across waves. `ewScram` is
 * wire-encoded as a positive count (no sign convention quirk here, unlike
 * `ewNeut`), so a straight sum is the count.
 */
export function siteScramTotal(s: SiteDetail): number {
  return s.waves.reduce((n, w) => n + (w.ewScram ?? 0), 0);
}

// Returns the comparison-ready primitive for each sortable key. Numeric
// columns can return null when the row has no value; the comparator pushes
// those rows to the end regardless of direction.
function valueFor(s: SiteDetail, key: SortableKey): string | number | null {
  switch (key) {
    case 'name':     return s.name;
    case 'type':     return TYPE_ORDER[s.siteType];
    case 'isk':      return siteIskValue(s);
    case 'blueLoot': return s.blueLootIsk;
    case 'scrams':   return siteScramTotal(s);
    case 'class': {
      if (s.wormholeClass) return CLASS_ORDER[s.wormholeClass];
      // Gas sites have a class RANGE rather than a single class; sort them
      // by their min class so they slot in next to wave-driven sites of the
      // lowest class they can spawn in.
      if (s.siteType === 'gas') {
        const range = gasClassRange(s.name);
        if (range) return CLASS_ORDER[range.min];
      }
      return null;
    }
  }
}

/**
 * Returns a stable copy of site rows sorted by the selected key and direction, with canonical name
 * tie-breaking.
 */
export function sortSitesForTable(
  sites: SiteDetail[],
  sortKey: SortableKey | null,
  sortDir: SortDir,
): SiteDetail[] {
  if (sortKey === null) return sites;
  const mult = sortDir === 'asc' ? 1 : -1;
  return [...sites].sort((a, b) => {
    const av = valueFor(a, sortKey);
    const bv = valueFor(b, sortKey);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * mult;
    }
    return ((av as number) - (bv as number)) * mult;
  });
}
