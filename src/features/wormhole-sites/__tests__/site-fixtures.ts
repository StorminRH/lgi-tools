import type { SiteSearchEntry } from '../queries';
import type { Npc, SiteDetail, SiteResource, Wave } from '../types';

/** An unpriced C5 combat site with no waves or resources. */
export function siteDetail(over: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: 1,
    name: 'Test Site',
    siteType: 'combat',
    wormholeClass: 'C5',
    signatureLabel: 'ABC-123',
    sourceTab: 'Sheet',
    blueLootIsk: null,
    iskPerEhp: null,
    resourceValueIsk: null,
    waves: [],
    resources: [],
    ...over,
  };
}

/** An unpriced C5 combat site index entry with no live recipes. */
export function siteSearchEntry(over: Partial<SiteSearchEntry> = {}): SiteSearchEntry {
  return {
    id: 1,
    name: 'Test Site',
    siteType: 'combat',
    wormholeClass: 'C5',
    blueLootIsk: null,
    resourceValueIsk: null,
    ...over,
  };
}

/**
 * An unpriced, live-ineligible resource. Unless the caller passes
 * effectiveIsk, it follows the read model's rule: liveIsk ?? totalIsk.
 */
export function siteResource(over: Partial<SiteResource> = {}): SiteResource {
  const resource: SiteResource = {
    id: 1,
    orderInSite: 0,
    resourceKind: 'ore',
    resourceName: 'Test Resource',
    units: null,
    volumeM3: null,
    iskPerM3: null,
    totalIsk: null,
    typeId: null,
    liveIsk: null,
    effectiveIsk: null,
    liveEligible: false,
    ...over,
  };
  if (over.effectiveIsk !== undefined) return resource;
  return { ...resource, effectiveIsk: resource.liveIsk ?? resource.totalIsk };
}

/** An empty first wave that fields no EWAR (null, as the read model stores it). */
export function siteWave(over: Partial<Wave> = {}): Wave {
  return {
    id: 1,
    waveNumber: 1,
    waveLabel: 'Wave 1',
    ewScram: null,
    ewWeb: null,
    ewNeut: null,
    ewRrep: null,
    dpsTotal: 0,
    alphaTotal: 0,
    ehpTotal: 0,
    npcs: [],
    ...over,
  };
}

/** One frigate sleeper with no combat stats (null, as an unmatched type reads). */
export function siteNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 1,
    orderInWave: 0,
    triggerLabel: null,
    quantity: 1,
    sleeperName: 'Test Sleeper',
    sleeperClassCode: 'F',
    scram: null,
    web: null,
    neut: null,
    rrep: null,
    sig: null,
    speed: null,
    distance: null,
    velocity: null,
    dps: null,
    alpha: null,
    ehp: null,
    ...over,
  };
}
