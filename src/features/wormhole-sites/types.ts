import type { SiteType, WormholeClass } from './schema';

export type { SiteType, WormholeClass };
/** Schema-derived site-detail wire types retained at the feature's established type surface. */
export type { Npc, SiteDetail, SiteResource, Wave } from './api-contract';

/**
 * One caller-supplied site list item; its value is the stable control key and its label or marker
 * is presentation-ready.
 */
export interface SiteListItem {
  id: number;
  name: string;
  siteType: SiteType;
  wormholeClass: WormholeClass | null;
  signatureLabel: string;
  sourceTab: string;
  blueLootIsk: number | null;
  iskPerEhp: number | null;
  resourceValueIsk: number | null;
}
