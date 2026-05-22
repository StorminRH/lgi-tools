import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { npcs, siteResources, sites, waves } from '@/db/schema';
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

export async function listSites(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteListItem[]> {
  const conditions = [
    filters.type ? eq(sites.siteType, filters.type) : undefined,
    filters.wormholeClass ? eq(sites.wormholeClass, filters.wormholeClass) : undefined,
  ].filter((c) => c !== undefined);

  return db
    .select(SITE_LIST_COLUMNS)
    .from(sites)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sites.sourceTab, sites.name);
}

export async function getSiteDetail(id: number): Promise<SiteDetail | null> {
  const [site] = await db.select(SITE_LIST_COLUMNS).from(sites).where(eq(sites.id, id));
  if (!site) return null;

  const siteWaves = await db
    .select({
      id: waves.id,
      waveNumber: waves.waveNumber,
      waveLabel: waves.waveLabel,
      ewScram: waves.ewScram,
      ewWeb: waves.ewWeb,
      ewNeut: waves.ewNeut,
      ewRrep: waves.ewRrep,
      dpsTotal: waves.dpsTotal,
      alphaTotal: waves.alphaTotal,
      ehpTotal: waves.ehpTotal,
    })
    .from(waves)
    .where(eq(waves.siteId, id))
    .orderBy(waves.waveNumber);

  const waveIds = siteWaves.map((w) => w.id);

  const allNpcs: (Npc & { waveId: number })[] =
    waveIds.length > 0
      ? await db
          .select({
            id: npcs.id,
            waveId: npcs.waveId,
            orderInWave: npcs.orderInWave,
            triggerLabel: npcs.triggerLabel,
            quantity: npcs.quantity,
            sleeperName: npcs.sleeperName,
            sleeperClassCode: npcs.sleeperClassCode,
            scram: npcs.scram,
            web: npcs.web,
            neut: npcs.neut,
            rrep: npcs.rrep,
            sig: npcs.sig,
            speed: npcs.speed,
            distance: npcs.distance,
            velocity: npcs.velocity,
            dps: npcs.dps,
            alpha: npcs.alpha,
            ehp: npcs.ehp,
          })
          .from(npcs)
          .where(inArray(npcs.waveId, waveIds))
          .orderBy(npcs.orderInWave)
      : [];

  const resources: SiteResource[] = await db
    .select({
      id: siteResources.id,
      orderInSite: siteResources.orderInSite,
      resourceKind: siteResources.resourceKind,
      resourceName: siteResources.resourceName,
      units: siteResources.units,
      volumeM3: siteResources.volumeM3,
      iskPerM3: siteResources.iskPerM3,
      totalIsk: siteResources.totalIsk,
    })
    .from(siteResources)
    .where(eq(siteResources.siteId, id))
    .orderBy(siteResources.orderInSite);

  const npcsByWaveId = new Map<number, Npc[]>();
  for (const { waveId, ...npc } of allNpcs) {
    const bucket = npcsByWaveId.get(waveId) ?? [];
    bucket.push(npc);
    npcsByWaveId.set(waveId, bucket);
  }

  const assembledWaves: Wave[] = siteWaves.map((w) => ({
    ...w,
    npcs: npcsByWaveId.get(w.id) ?? [],
  }));

  return { ...site, waves: assembledWaves, resources };
}
