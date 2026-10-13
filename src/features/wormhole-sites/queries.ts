import { eq, inArray, type SQL } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { npcs, siteResources, sites, waves } from './schema';
import { SDE_CACHE_TAG } from '@/data/eve-data/constants';
import { MARKET_PRICES_TAG } from '@/data/market-prices/keys';
import { getCombatStatsBatch } from '@/data/npc-stats/queries';
import { summariseWave } from '@/data/npc-stats/math';
import type { CombatStats } from '@/data/npc-stats/types';
import { dedupe, groupBy } from '@/lib/array';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { waveEwar } from './ewar';
import { overlayLivePrices } from './live-prices';
import { liveRecipesForSearch } from './live-recipes-for-search';
import { siteClassSet } from './site-filter';
import type { SiteLiveRecipe } from './site-name-lookup';
import type { Npc, SiteDetail, SiteListItem, SiteResource, Wave, WormholeClass, SiteType } from './types';

const SITE_LIST_COLUMNS = {
  id: sites.id,
  name: sites.name,
  siteType: sites.siteType,
  wormholeClass: sites.wormholeClass,
  signatureLabel: sites.signatureLabel,
  sourceTab: sites.sourceTab,
  blueLootIsk: sites.blueLootIsk,
  iskPerEhp: sites.iskPerEhp,
  resourceValueIsk: sites.resourceValueIsk,
} as const;

const WAVE_COLUMNS = {
  id: waves.id,
  siteId: waves.siteId,
  waveNumber: waves.waveNumber,
  waveLabel: waves.waveLabel,
} as const;

const NPC_COLUMNS = {
  id: npcs.id,
  waveId: npcs.waveId,
  typeId: npcs.typeId,
  orderInWave: npcs.orderInWave,
  triggerLabel: npcs.triggerLabel,
  quantity: npcs.quantity,
  sleeperName: npcs.sleeperName,
  sleeperClassCode: npcs.sleeperClassCode,
} as const;

const SITE_RESOURCE_COLUMNS = {
  id: siteResources.id,
  siteId: siteResources.siteId,
  orderInSite: siteResources.orderInSite,
  resourceKind: siteResources.resourceKind,
  resourceName: siteResources.resourceName,
  units: siteResources.units,
  volumeM3: siteResources.volumeM3,
  iskPerM3: siteResources.iskPerM3,
  totalIsk: siteResources.totalIsk,
  typeId: siteResources.typeId,
} as const;

type NpcRow = {
  id: number;
  waveId: number;
  typeId: number;
  orderInWave: number;
  triggerLabel: string | null;
  quantity: number;
  sleeperName: string;
  sleeperClassCode: string;
};

type WaveRow = {
  id: number;
  siteId: number;
  waveNumber: number;
  waveLabel: string;
};

function mergeNpc(base: NpcRow, stats: CombatStats | undefined): Npc {
  const { waveId: _waveId, typeId: _typeId, ...rest } = base;
  if (!stats) {
    return { ...rest, scram: null, web: null, neut: null, rrep: null,
      sig: null, speed: null, distance: null, velocity: null,
      dps: null, alpha: null, ehp: null };
  }
  return {
    ...rest,
    scram: stats.ewar.scram,
    web: stats.ewar.web !== 0 ? 1 : 0,
    neut: -stats.ewar.neutCount,
    rrep: stats.ewar.rrepCount,
    sig: stats.movement.sigRadius,
    speed: stats.movement.maxVelocity,
    distance: stats.movement.orbitDistance,
    velocity: stats.movement.orbitVelocity,
    dps: Math.round(stats.total.dps),
    alpha: Math.round(stats.total.alpha),
    ehp: Math.round(stats.hp.ehp),
  };
}

function aggregateWave(
  row: WaveRow,
  npcRows: NpcRow[],
  statsByType: Map<number, CombatStats>,
): Wave {
  const enriched: Npc[] = npcRows.map((n) => mergeNpc(n, statsByType.get(n.typeId)));

  const contributing = npcRows
    .map((n) => ({ stats: statsByType.get(n.typeId), quantity: n.quantity }))
    .filter((x): x is { stats: CombatStats; quantity: number } => x.stats !== undefined);
  const totals = summariseWave(contributing);

  return {
    id: row.id,
    waveNumber: row.waveNumber,
    waveLabel: row.waveLabel,
    ...waveEwar(enriched),
    dpsTotal: totals.dpsTotal,
    alphaTotal: totals.alphaTotal,
    ehpTotal: totals.ehpTotal,
    npcs: enriched,
  };
}

async function selectSiteRows(where?: SQL): Promise<SiteListItem[]> {
  return db
    .select(SITE_LIST_COLUMNS)
    .from(sites)
    .where(where)
    .orderBy(sites.sourceTab, sites.name);
}

/**
 * Builds each site's waves (NPCs enriched with combat stats) and unpriced
 * resources, in siteRows order. An empty list makes no further reads.
 */
async function assembleSiteDetails(siteRows: SiteListItem[]): Promise<SiteDetail[]> {
  if (siteRows.length === 0) return [];
  const siteIds = siteRows.map((s) => s.id);

  const [waveRows, resourceRows, npcRows] = await Promise.all([
    db
      .select(WAVE_COLUMNS)
      .from(waves)
      .where(inArray(waves.siteId, siteIds))
      .orderBy(waves.siteId, waves.waveNumber),
    db
      .select(SITE_RESOURCE_COLUMNS)
      .from(siteResources)
      .where(inArray(siteResources.siteId, siteIds))
      .orderBy(siteResources.orderInSite),
    db
      .select(NPC_COLUMNS)
      .from(npcs)
      .innerJoin(waves, eq(npcs.waveId, waves.id))
      .where(inArray(waves.siteId, siteIds))
      .orderBy(npcs.orderInWave),
  ]);

  const statsByType = await getCombatStatsBatch(dedupe(npcRows.map((n) => n.typeId)));
  const npcsByWaveId = groupBy(npcRows, (n) => n.waveId);

  const wavesBySiteId = groupBy(
    waveRows,
    (w) => w.siteId,
    (w) => aggregateWave(w, npcsByWaveId.get(w.id) ?? [], statsByType),
  );

  const resourcesBySiteId = groupBy(
    resourceRows,
    (r) => r.siteId,
    ({ siteId: _siteId, ...resource }): SiteResource => ({
      ...resource,
      liveIsk: null,
      effectiveIsk: resource.totalIsk,
      liveEligible: false,
    }),
  );

  return siteRows.map((site) => ({
    ...site,
    waves: wavesBySiteId.get(site.id) ?? [],
    resources: resourcesBySiteId.get(site.id) ?? [],
  }));
}

export async function listSites(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteListItem[]> {
  'use cache';
  cacheLife('max');
  const { type, wormholeClass } = filters;
  const rows = await withColdStartRetry(() =>
    selectSiteRows(type ? eq(sites.siteType, type) : undefined),
  );
  return wormholeClass ? rows.filter((s) => siteClassSet(s).includes(wormholeClass)) : rows;
}

export async function listSiteDetails(): Promise<SiteDetail[]> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);
  return withColdStartRetry(async () => assembleSiteDetails(await selectSiteRows()));
}

export type SiteSearchEntry = {
  id: number;
  name: string;
  siteType: SiteType;
  wormholeClass: WormholeClass | null;
  blueLootIsk: number | null;
  resourceValueIsk: number | null;
  liveRecipes?: readonly SiteLiveRecipe[];
};

export async function getSiteSearchIndex(): Promise<SiteSearchEntry[]> {
  'use cache';
  cacheLife('max');
  return withColdStartRetry(() =>
    db
      .select({
        id: sites.id,
        name: sites.name,
        siteType: sites.siteType,
        wormholeClass: sites.wormholeClass,
        blueLootIsk: sites.blueLootIsk,
        resourceValueIsk: sites.resourceValueIsk,
      })
      .from(sites)
      .orderBy(sites.sourceTab, sites.name),
  );
}

/** The scanner's catalogue, priced like the sites list and cleared by the same price writes. */
export async function getScannerSiteIndex(): Promise<SiteSearchEntry[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(MARKET_PRICES_TAG);
  const priced = await listPricedSiteDetails();
  return priced.map((site) => ({
    id: site.id,
    name: site.name,
    siteType: site.siteType,
    wormholeClass: site.wormholeClass,
    blueLootIsk: site.blueLootIsk,
    resourceValueIsk: site.resourceValueIsk,
    liveRecipes: liveRecipesForSearch(site.resources),
  }));
}

async function getSiteDetail(id: number): Promise<SiteDetail | null> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);
  return withColdStartRetry(async () => {
    const [detail] = await assembleSiteDetails(await selectSiteRows(eq(sites.id, id)));
    return detail ?? null;
  });
}

/**
 * The whole catalogue priced from the stored Forge order books, cached
 * across instances until a price write clears the tag. It only aggregates
 * stored prices and never refreshes them, and every price write clears
 * MARKET_PRICES_TAG, so it lives until then rather than until the earliest
 * book expires: one of those has nearly always expired, and the entry
 * would be rebuilt on every request.
 */
export async function listPricedSiteDetails(): Promise<SiteDetail[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(MARKET_PRICES_TAG);
  const raw = await listSiteDetails();
  return withColdStartRetry(() => overlayLivePrices(raw));
}

/** One site priced the same way, under the same tag. */
export async function getPricedSiteDetail(id: number): Promise<SiteDetail | null> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(MARKET_PRICES_TAG);
  const raw = await getSiteDetail(id);
  if (!raw) return null;
  const [priced] = await withColdStartRetry(() => overlayLivePrices([raw]));
  return priced ?? null;
}
