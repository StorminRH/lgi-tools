import { and, count, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { npcs, siteResources, sites, waves } from './schema';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getCombatStatsBatch } from '@/data/npc-stats/queries';
import { summariseWave } from '@/data/npc-stats/math';
import type { CombatStats } from '@/data/npc-stats/types';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { classRangeIncludes, gasClassRange } from './gas-classes';
import { overlayLivePrices } from './live-prices';
import { liveRecipesForSearch } from './live-recipes-for-search';
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

function nullIfZero(value: number, anyContrib: boolean): number | null {
  return anyContrib ? value : null;
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

  let ewScramSum = 0;
  let ewWebSum = 0;
  let ewNeutSum = 0;
  let ewRrepSum = 0;
  let anyScram = false;
  let anyWeb = false;
  let anyNeut = false;
  let anyRrep = false;
  for (const n of npcRows) {
    const stats = statsByType.get(n.typeId);
    if (!stats) continue;
    if (stats.ewar.scram > 0) {
      ewScramSum += stats.ewar.scram;
      anyScram = true;
    }
    if (stats.ewar.web !== 0) {
      ewWebSum += 1;
      anyWeb = true;
    }
    if (stats.ewar.neutCount > 0) {
      ewNeutSum += -stats.ewar.neutCount;
      anyNeut = true;
    }
    if (stats.ewar.rrepCount > 0) {
      ewRrepSum += stats.ewar.rrepCount;
      anyRrep = true;
    }
  }

  return {
    id: row.id,
    waveNumber: row.waveNumber,
    waveLabel: row.waveLabel,
    ewScram: nullIfZero(ewScramSum, anyScram),
    ewWeb: nullIfZero(ewWebSum, anyWeb),
    ewNeut: nullIfZero(ewNeutSum, anyNeut),
    ewRrep: nullIfZero(ewRrepSum, anyRrep),
    dpsTotal: totals.dpsTotal,
    alphaTotal: totals.alphaTotal,
    ehpTotal: totals.ehpTotal,
    npcs: enriched,
  };
}

function matchesClass(s: Pick<SiteListItem, 'name' | 'siteType' | 'wormholeClass'>, cls: WormholeClass): boolean {
  if (s.wormholeClass === cls) return true;
  if (s.siteType === 'gas') {
    const range = gasClassRange(s.name);
    return range !== null && classRangeIncludes(range, cls);
  }
  return false;
}

export async function listSites(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteListItem[]> {

  'use cache';
  cacheLife('max');

  const conditions = [
    filters.type ? eq(sites.siteType, filters.type) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await withColdStartRetry(() =>
    db
      .select(SITE_LIST_COLUMNS)
      .from(sites)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sites.sourceTab, sites.name),
  );

  return filters.wormholeClass
    ? rows.filter((s) => matchesClass(s, filters.wormholeClass!))
    : rows;
}

async function loadNpcsForWaves(waveIds: number[]): Promise<NpcRow[]> {
  if (waveIds.length === 0) return [];
  return db
    .select({
      id: npcs.id,
      waveId: npcs.waveId,
      typeId: npcs.typeId,
      orderInWave: npcs.orderInWave,
      triggerLabel: npcs.triggerLabel,
      quantity: npcs.quantity,
      sleeperName: npcs.sleeperName,
      sleeperClassCode: npcs.sleeperClassCode,
    })
    .from(npcs)
    .where(inArray(npcs.waveId, waveIds))
    .orderBy(npcs.orderInWave);
}

export async function listSiteDetails(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteDetail[]> {

  'use cache';
  cacheLife('max');

  return withColdStartRetry(async () => {

    const conditions = [
      filters.type ? eq(sites.siteType, filters.type) : undefined,
    ].filter((c) => c !== undefined);

    const allRows = await db
      .select(SITE_LIST_COLUMNS)
      .from(sites)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sites.sourceTab, sites.name);

    const siteRows = filters.wormholeClass
      ? allRows.filter((s) => matchesClass(s, filters.wormholeClass!))
      : allRows;

    if (siteRows.length === 0) return [];

    const siteIds = siteRows.map((s) => s.id);

    const [waveRows, resourceRows]: [
      WaveRow[],
      (Omit<SiteResource, 'liveIsk' | 'effectiveIsk' | 'liveEligible'> & { siteId: number })[],
    ] = await Promise.all([
      db
        .select({
          id: waves.id,
          siteId: waves.siteId,
          waveNumber: waves.waveNumber,
          waveLabel: waves.waveLabel,
        })
        .from(waves)
        .where(inArray(waves.siteId, siteIds))
        .orderBy(waves.siteId, waves.waveNumber),
      db
        .select({
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
        })
        .from(siteResources)
        .where(inArray(siteResources.siteId, siteIds))
        .orderBy(siteResources.orderInSite),
    ]);

    const waveIds = waveRows.map((w) => w.id);

    const npcRows = await loadNpcsForWaves(waveIds);

    const distinctTypeIds = [...new Set(npcRows.map((n) => n.typeId))];
    const statsByType = await getCombatStatsBatch(distinctTypeIds);

    const npcsByWaveId = new Map<number, NpcRow[]>();
    for (const n of npcRows) {
      const bucket = npcsByWaveId.get(n.waveId) ?? [];
      bucket.push(n);
      npcsByWaveId.set(n.waveId, bucket);
    }

    const wavesBySiteId = new Map<number, Wave[]>();
    for (const w of waveRows) {
      const wave = aggregateWave(w, npcsByWaveId.get(w.id) ?? [], statsByType);
      const bucket = wavesBySiteId.get(w.siteId) ?? [];
      bucket.push(wave);
      wavesBySiteId.set(w.siteId, bucket);
    }

    const resourcesBySiteId = new Map<number, SiteResource[]>();
    for (const { siteId, ...resource } of resourceRows) {
      const hydrated: SiteResource = {
        ...resource,
        liveIsk: null,
        effectiveIsk: resource.totalIsk,
        liveEligible: false,
      };
      const bucket = resourcesBySiteId.get(siteId) ?? [];
      bucket.push(hydrated);
      resourcesBySiteId.set(siteId, bucket);
    }

    return siteRows.map((site) => ({
      ...site,
      waves: wavesBySiteId.get(site.id) ?? [],
      resources: resourcesBySiteId.get(site.id) ?? [],
    }));
  });
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

export async function getCachedSiteCount(): Promise<number> {
  'use cache';
  cacheLife('max');
  return withColdStartRetry(async () => {
    const [row] = await db.select({ n: count() }).from(sites);
    return Number(row?.n ?? 0);
  });
}

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

export async function getScannerSiteIndex(): Promise<SiteSearchEntry[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
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

  return withColdStartRetry(async () => {
    const [site] = await db.select(SITE_LIST_COLUMNS).from(sites).where(eq(sites.id, id));
    if (!site) return null;

    const [siteWaves, resourceRows] = await Promise.all([
      db
        .select({
          id: waves.id,
          siteId: waves.siteId,
          waveNumber: waves.waveNumber,
          waveLabel: waves.waveLabel,
        })
        .from(waves)
        .where(eq(waves.siteId, id))
        .orderBy(waves.waveNumber),
      db
        .select({
          id: siteResources.id,
          orderInSite: siteResources.orderInSite,
          resourceKind: siteResources.resourceKind,
          resourceName: siteResources.resourceName,
          units: siteResources.units,
          volumeM3: siteResources.volumeM3,
          iskPerM3: siteResources.iskPerM3,
          totalIsk: siteResources.totalIsk,
          typeId: siteResources.typeId,
        })
        .from(siteResources)
        .where(eq(siteResources.siteId, id))
        .orderBy(siteResources.orderInSite),
    ]);

    const waveIds = siteWaves.map((w) => w.id);

    const allNpcs = await loadNpcsForWaves(waveIds);

    const resources: SiteResource[] = resourceRows.map((r) => ({
      ...r,
      liveIsk: null,
      effectiveIsk: r.totalIsk,
      liveEligible: false,
    }));

    const distinctTypeIds = [...new Set(allNpcs.map((n) => n.typeId))];
    const statsByType = await getCombatStatsBatch(distinctTypeIds);

    const npcsByWaveId = new Map<number, NpcRow[]>();
    for (const n of allNpcs) {
      const bucket = npcsByWaveId.get(n.waveId) ?? [];
      bucket.push(n);
      npcsByWaveId.set(n.waveId, bucket);
    }

    const assembledWaves: Wave[] = siteWaves.map((w) =>
      aggregateWave(w, npcsByWaveId.get(w.id) ?? [], statsByType),
    );

    return { ...site, waves: assembledWaves, resources };
  });
}

export async function listPricedSiteDetails(): Promise<SiteDetail[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  const raw = await listSiteDetails({});

  return withColdStartRetry(() => overlayLivePrices(raw));
}

export async function getPricedSiteDetail(id: number): Promise<SiteDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  const raw = await getSiteDetail(id);
  if (!raw) return null;

  const [priced] = await withColdStartRetry(() => overlayLivePrices([raw]));
  return priced ?? null;
}
