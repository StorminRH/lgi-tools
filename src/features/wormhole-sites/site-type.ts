import type { SiteType } from './site-taxonomy';

/**
 * The order the site pages list types in. SITE_TYPES keeps the database
 * enum order, so this list is separate from it.
 */
export const SITE_TYPE_DISPLAY_ORDER: readonly SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];

/** Relic and data sites, whose loot comes from hacking containers. */
export type HackingSiteType = Extract<SiteType, 'relic' | 'data'>;

export function isHackingSiteType(type: SiteType): type is HackingSiteType {
  return type === 'relic' || type === 'data';
}

/**
 * Combat and hacking sites, valued by their blue loot. Ore and gas sites
 * are valued by their resources instead.
 */
export function isWaveDrivenSiteType(type: SiteType): type is 'combat' | HackingSiteType {
  return type === 'combat' || isHackingSiteType(type);
}

/** A site's headline value: blue loot for a wave-driven site, resource value otherwise. */
export function primarySiteIsk(entry: {
  readonly siteType: SiteType;
  readonly blueLootIsk: number | null;
  readonly resourceValueIsk: number | null;
}): number | null {
  return isWaveDrivenSiteType(entry.siteType) ? entry.blueLootIsk : entry.resourceValueIsk;
}
