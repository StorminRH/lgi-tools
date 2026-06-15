import { gasClassRange } from './gas-classes';
import { WORMHOLE_CLASSES } from './schema';
import type { SiteListItem, WormholeClass } from './types';

// The set of wormhole classes a site belongs to, for the /sites filter rail.
// Most sites carry a single `wormholeClass`; gas sites have a NULL class but a
// name-derived spawn range (gas-classes.ts), expanded here so a gas signature
// matches any class within its range. Sites with neither (rare) match no class
// filter — they only appear when no class is selected.
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
