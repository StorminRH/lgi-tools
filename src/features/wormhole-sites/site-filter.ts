import { siteClassRange, wormholeClassRank } from './site-class';
import { WORMHOLE_CLASSES } from './site-taxonomy';
import type { SiteListItem, SiteType, WormholeClass } from './types';

export function siteClassSet(
  site: Pick<SiteListItem, 'wormholeClass' | 'siteType' | 'name'>,
): WormholeClass[] {
  const range = siteClassRange(site);
  return range
    ? WORMHOLE_CLASSES.slice(wormholeClassRank(range.min), wormholeClassRank(range.max) + 1)
    : [];
}

export function matchesClassFilter(clsSet: WormholeClass[], cls: WormholeClass[]): boolean {
  return cls.length === 0 || cls.some((c) => clsSet.includes(c));
}

export function matchesFilter(
  site: { type: SiteType | null; clsSet: WormholeClass[] },
  selection: { cls: WormholeClass[]; types: SiteType[] },
): boolean {
  const typeOk =
    selection.types.length === 0 || (site.type != null && selection.types.includes(site.type));
  return matchesClassFilter(site.clsSet, selection.cls) && typeOk;
}
