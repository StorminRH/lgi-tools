import { gasClassRange } from './gas-classes';
import { WORMHOLE_CLASSES } from './schema';
import type { SiteListItem, SiteType, WormholeClass } from './types';

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
