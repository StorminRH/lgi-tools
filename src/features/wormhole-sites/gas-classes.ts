import type { SiteDetail, WormholeClass } from './types';

export interface ClassRange {
  min: WormholeClass;
  max: WormholeClass;
}

const CLASS_ORDER: Record<WormholeClass, number> = {
  C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6,
};

export function gasClassRange(name: string): ClassRange | null {
  if (name.includes('Perimeter')) return { min: 'C1', max: 'C6' };
  if (name.includes('Frontier'))  return { min: 'C3', max: 'C6' };
  if (name.includes('Core'))      return { min: 'C5', max: 'C6' };
  return null;
}

export function formatClassRange(range: ClassRange): string {
  if (range.min === range.max) return range.min;
  return `${range.min}–${range.max}`;
}

export function classRangeIncludes(range: ClassRange, cls: WormholeClass): boolean {
  return CLASS_ORDER[cls] >= CLASS_ORDER[range.min] && CLASS_ORDER[cls] <= CLASS_ORDER[range.max];
}

export function siteClass(
  site: Pick<SiteDetail, 'name' | 'siteType' | 'wormholeClass'>,
): { min: WormholeClass; label: string } | null {
  if (site.wormholeClass) return { min: site.wormholeClass, label: site.wormholeClass };
  const range = site.siteType === 'gas' ? gasClassRange(site.name) : null;
  return range ? { min: range.min, label: formatClassRange(range) } : null;
}

export function siteClassLabel(site: Pick<SiteDetail, 'name' | 'siteType' | 'wormholeClass'>): string | null {
  return siteClass(site)?.label ?? null;
}
