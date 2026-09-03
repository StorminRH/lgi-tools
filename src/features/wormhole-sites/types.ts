import type { SiteType, WormholeClass } from './schema';

export type { SiteType, WormholeClass };

export type { Npc, SiteDetail, SiteResource, Wave } from './api-contract';

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
