import { WORMHOLE_CLASSES, type SiteType, type WormholeClass } from './site-taxonomy';

export interface ClassRange {
  min: WormholeClass;
  max: WormholeClass;
}

/** A class's place in C1 to C6, counting from 0. */
export function wormholeClassRank(cls: WormholeClass): number {
  return WORMHOLE_CLASSES.indexOf(cls);
}

function gasClassRange(name: string): ClassRange | null {
  if (name.includes('Perimeter')) return { min: 'C1', max: 'C6' };
  if (name.includes('Frontier'))  return { min: 'C3', max: 'C6' };
  if (name.includes('Core'))      return { min: 'C5', max: 'C6' };
  return null;
}

/**
 * The classes a site spawns in: its own wormhole class when it has one,
 * otherwise a gas site's spawn range read from its name.
 */
export function siteClassRange(site: {
  readonly wormholeClass: WormholeClass | null;
  readonly siteType: SiteType;
  readonly name: string;
}): ClassRange | null {
  if (site.wormholeClass) return { min: site.wormholeClass, max: site.wormholeClass };
  return site.siteType === 'gas' ? gasClassRange(site.name) : null;
}

export function formatClassRange(range: ClassRange): string {
  if (range.min === range.max) return range.min;
  return `${range.min}–${range.max}`;
}
