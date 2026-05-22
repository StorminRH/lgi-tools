import type { SiteType, WormholeClass } from './schema';

export type { SiteType, WormholeClass };

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

export interface Npc {
  id: number;
  orderInWave: number;
  triggerLabel: string | null;
  quantity: number;
  sleeperName: string;
  sleeperClassCode: string;
  scram: number | null;
  web: number | null;
  neut: number | null;
  rrep: number | null;
  sig: number | null;
  speed: number | null;
  distance: number | null;
  velocity: number | null;
  dps: number | null;
  alpha: number | null;
  ehp: number | null;
}

export interface Wave {
  id: number;
  waveNumber: number;
  waveLabel: string;
  ewScram: number | null;
  ewWeb: number | null;
  ewNeut: number | null;
  ewRrep: number | null;
  dpsTotal: number | null;
  alphaTotal: number | null;
  ehpTotal: number | null;
  npcs: Npc[];
}

export interface SiteResource {
  id: number;
  orderInSite: number;
  resourceKind: string;
  resourceName: string;
  units: number | null;
  volumeM3: number | null;
  iskPerM3: number | null;
  totalIsk: number | null;
}

export interface SiteDetail extends SiteListItem {
  waves: Wave[];
  resources: SiteResource[];
}

export interface ApiError {
  error: string;
}
