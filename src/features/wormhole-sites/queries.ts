import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { npcs, siteResources, sites, waves } from '@/db/schema';
import { getCombatStatsBatch } from '@/data/npc-stats/queries';
import { summariseWave } from '@/data/npc-stats/math';
import type { CombatStats } from '@/data/npc-stats/types';
import { classRangeIncludes, gasClassRange } from './gas-classes';
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

// Raw `npcs` row as the DB returns it now that the cached stat columns are
// gone. Combat stats are merged on top from getCombatStatsBatch.
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

// Wire-format conversion from CombatStats to the per-NPC fields the API has
// always returned. Kept in one place — same mapping used by both list and
// detail queries.
//
// Three semantics preserved from the original Phase 1 ingest of the C1-C6
// tabs (NOT the Calculations tab):
//  - `web` is a 0/1 presence flag (the sleeper either fits a web or it doesn't),
//    not the speed factor (the SDE attribute -60% lives in stats.ewar.web)
//  - `neut` is the NEGATIVE per-NPC neut count (the Sheet's C1-C6 tabs print
//    it as "-6" to read as "you take 6 neut")
//  - `rrep` is the POSITIVE per-NPC rep count
function mergeNpc(base: NpcRow, stats: CombatStats | undefined): Npc {
  const { waveId: _waveId, typeId: _typeId, ...rest } = base;
  if (!stats) {
    // Type isn't in the SDE ingest (shouldn't happen in normal operation;
    // surface as null fields rather than crash so the rest of the response
    // stays valid).
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

// Build wave-level aggregates. Combat totals (dps/alpha/ehp) go through
// summariseWave's quantity-weighted sum — that's the honest "what damage
// hits you per second" number. EWAR aggregates follow a different rule
// preserved from pre-2.7.1: each ew* field is the sum across distinct NPC
// TYPES of that type's per-NPC EWAR value, NOT quantity-weighted (so a
// wave with 3× Awakened Watchman (neut=-6) reports ewNeut=-6, not -18).
// The wire is null when no NPC contributes to that category, otherwise the
// integer sum.
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

  // Sum each per-NPC EWAR value across the wave's NPC types (no quantity
  // multiplication — see comment above). One row per NPC type, taking the
  // wire-format per-NPC value, including the sign convention.
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

// Class match accounts for two cases: ordinary classed sites (an exact
// match on the column) AND gas sites whose `wormhole_class` is always NULL
// in the data but whose name encodes a class RANGE (see ./gas-classes).
// Filtering by class therefore happens in JS so the range logic can apply.
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
  // Class filtering happens post-fetch (see matchesClass) — only `type` goes
  // into the SQL clause. The whole-table cost of fetching ~70 rows is
  // negligible vs. the clarity of single-source-of-truth class matching.
  const conditions = [
    filters.type ? eq(sites.siteType, filters.type) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select(SITE_LIST_COLUMNS)
    .from(sites)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sites.sourceTab, sites.name);

  return filters.wormholeClass
    ? rows.filter((s) => matchesClass(s, filters.wormholeClass!))
    : rows;
}

export async function listSiteDetails(filters: {
  type?: SiteType;
  wormholeClass?: WormholeClass;
}): Promise<SiteDetail[]> {
  // Class filtering applied in JS post-fetch (see matchesClass) so gas
  // sites can match by their name-derived class range rather than the
  // always-NULL `wormhole_class` column.
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

  // Waves and resources are both keyed off siteIds with no dependency on each
  // other; fetch them concurrently. NPCs still wait on waveIds afterwards.
  const [waveRows, resourceRows]: [
    WaveRow[],
    (Omit<SiteResource, 'liveIsk' | 'effectiveIsk'> & { siteId: number })[],
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

  const npcRows: NpcRow[] =
    waveIds.length > 0
      ? await db
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
          .orderBy(npcs.orderInWave)
      : [];

  // One batched fetch of combat stats for every distinct NPC type across all
  // sites — same shape as the existing 4-round-trip pattern for listSiteDetails.
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
}

// Minimal site shape for the global search dropdown. Server-rendered once
// in AppHeader and passed to the client via AppHeaderShell, so the search
// dropdown can filter against name/class/type without a per-keystroke
// round-trip. ~69 rows today; trivial payload.
export type SiteSearchEntry = {
  id: number;
  name: string;
  siteType: SiteType;
  wormholeClass: WormholeClass | null;
  blueLootIsk: number | null;
  resourceValueIsk: number | null;
};

export async function getSiteSearchIndex(): Promise<SiteSearchEntry[]> {
  return db
    .select({
      id: sites.id,
      name: sites.name,
      siteType: sites.siteType,
      wormholeClass: sites.wormholeClass,
      blueLootIsk: sites.blueLootIsk,
      resourceValueIsk: sites.resourceValueIsk,
    })
    .from(sites)
    .orderBy(sites.sourceTab, sites.name);
}

export async function getSiteDetail(id: number): Promise<SiteDetail | null> {
  const [site] = await db.select(SITE_LIST_COLUMNS).from(sites).where(eq(sites.id, id));
  if (!site) return null;

  // Waves and resources both key off the site id with no inter-dependency;
  // fetch them concurrently. NPCs still wait on waveIds afterwards.
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

  const allNpcs: NpcRow[] =
    waveIds.length > 0
      ? await db
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
          .orderBy(npcs.orderInWave)
      : [];

  const resources: SiteResource[] = resourceRows.map((r) => ({
    ...r,
    liveIsk: null,
    effectiveIsk: r.totalIsk,
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
}
