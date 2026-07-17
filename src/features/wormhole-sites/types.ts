import type { SiteType, WormholeClass } from './schema';

export type { SiteType, WormholeClass };

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

/** One wormhole-site NPC with quantity, hull class, combat statistics, bounty, and EWAR. */
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

/** One ordered wormhole-site wave containing trigger text and grouped NPC entries. */
export interface Wave {
  id: number;
  waveNumber: number;
  waveLabel: string;
  // EWAR totals are null when no NPC in the wave carries that effect (the
  // pre-2.7.1 wire-format convention, preserved). Combat totals are always
  // numbers — empty waves return 0, not null. The persisted columns that
  // used to back any of these fields were dropped in drizzle/0009; the
  // values are now recomputed live via npc-stats/summariseWave.
  ewScram: number | null;
  ewWeb: number | null;
  ewNeut: number | null;
  ewRrep: number | null;
  dpsTotal: number;
  alphaTotal: number;
  ehpTotal: number;
  npcs: Npc[];
}

/** One harvestable site resource with type identity, quantity, volume, and live value inputs. */
export interface SiteResource {
  id: number;
  orderInSite: number;
  resourceKind: string;
  resourceName: string;
  units: number | null;
  volumeM3: number | null;
  iskPerM3: number | null;
  totalIsk: number | null;
  // Eve type ID resolved at sheet-ingest time via the strict alias map.
  // NULL when the sheet name isn't in the map.
  typeId: number | null;
  // Populated by overlayLivePrices() when a live Jita 5% buy price is
  // available for this type. NULL on the raw DB shape.
  liveIsk: number | null;
  // What the UI actually renders: liveIsk ?? totalIsk. Set by the overlay;
  // falls back to totalIsk for raw rows (mock data, untouched DB reads).
  effectiveIsk: number | null;
  // True when this row CAN take a live value — it has a typeId, the SDE volume
  // gate passes, and a positive unit count. The on-view client island refreshes
  // only these (and the refresh API doesn't return SDE volume, so the gate must
  // be decided here, server-side). False rows always show their static seed.
  liveEligible: boolean;
}

/** Complete wormhole-site catalogue record with metadata, waves, resources, and derived combat totals. */
export interface SiteDetail extends SiteListItem {
  waves: Wave[];
  resources: SiteResource[];
}

/**
 * Closed wormhole sites failure contract for api error; consumers branch on the declared kind
 * instead of parsing messages.
 */
export interface ApiError {
  error: string;
}
