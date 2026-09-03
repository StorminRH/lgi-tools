import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { eveSolarSystems } from '@/data/eve-data/schema';
import { type SecurityClass, systemSecurityClass } from '@/data/eve-data/security';
import type { ParsedCorpStructure } from './esi-projection';
import { corpStructureRigs, corpStructures, corpStructureSharing, corpStructureSyncs } from './schema';
import type { CorpStructureRow, CorpStructureSharingState, CorpStructuresSyncState } from './types';

function corpStructuresTag(corporationId: number): string {
  return `corp-structures:${corporationId}`;
}

async function getCorpStructureRows(corporationId: number): Promise<CorpStructureRow[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(corpStructuresTag(corporationId));
  return db
    .select({
      structureId: corpStructures.structureId,
      typeId: corpStructures.typeId,
      systemId: corpStructures.systemId,
      securityClass: corpStructures.securityClass,
      name: corpStructures.name,
    })
    .from(corpStructures)
    .where(eq(corpStructures.corporationId, corporationId));
}

export async function getCorpStructures(
  corporationIds: number[],
): Promise<Map<number, CorpStructureRow[]>> {
  const perCorp = await Promise.all(
    corporationIds.map(async (corpId) => [corpId, await getCorpStructureRows(corpId)] as const),
  );
  return new Map(perCorp);
}

export async function readCorpStructureSyncState(
  corporationId: number,
): Promise<CorpStructuresSyncState | null> {
  const rows = await db
    .select({ lastRefreshedAt: corpStructureSyncs.lastRefreshedAt, pageEtags: corpStructureSyncs.pageEtags })
    .from(corpStructureSyncs)
    .where(eq(corpStructureSyncs.corporationId, corporationId))
    .limit(1);
  const row = rows[0];
  return row ? { lastRefreshedAt: row.lastRefreshedAt, pageEtags: row.pageEtags } : null;
}

export async function listCorpStructureSyncStates(
  corporationIds: number[],
): Promise<{ corporationId: number; lastRefreshedAt: Date }[]> {
  if (corporationIds.length === 0) return [];
  return db
    .select({ corporationId: corpStructureSyncs.corporationId, lastRefreshedAt: corpStructureSyncs.lastRefreshedAt })
    .from(corpStructureSyncs)
    .where(inArray(corpStructureSyncs.corporationId, corporationIds));
}

async function deriveSecurityClasses(
  rows: ParsedCorpStructure[],
): Promise<Map<number, SecurityClass>> {
  const result = new Map<number, SecurityClass>();
  const systemIds = [...new Set(rows.map((r) => r.system_id))];
  if (systemIds.length === 0) return result;
  const systems = await db
    .select({
      id: eveSolarSystems.id,
      securityStatus: eveSolarSystems.securityStatus,
      wormholeClassId: eveSolarSystems.wormholeClassId,
    })
    .from(eveSolarSystems)
    .where(inArray(eveSolarSystems.id, systemIds));
  const bySystem = new Map(
    systems.map((s) => [s.id, systemSecurityClass(s.securityStatus, s.wormholeClassId)] as const),
  );
  for (const r of rows) {
    result.set(r.structure_id, bySystem.get(r.system_id) ?? systemSecurityClass(null, null));
  }
  return result;
}

export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {

  if (!(await isCorpStructureSharingEnabled(corporationId))) return;
  const now = new Date();
  const securityByStructure = await deriveSecurityClasses(rows);
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  if (rows.length > 0) {
    await db.insert(corpStructures).values(
      rows.map((r) => ({
        corporationId,
        structureId: r.structure_id,
        typeId: r.type_id,
        systemId: r.system_id,
        securityClass: securityByStructure.get(r.structure_id) ?? systemSecurityClass(null, null),
        name: r.name ?? null,
      })),
    );
  }
  await db
    .insert(corpStructureSyncs)
    .values({ corporationId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: corpStructureSyncs.corporationId,
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
  revalidateTag(corpStructuresTag(corporationId), 'max');
}

export async function stampCorpStructuresFresh(corporationId: number): Promise<void> {
  await db
    .update(corpStructureSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(corpStructureSyncs.corporationId, corporationId));
}

export async function isCorpStructureSharingEnabled(corporationId: number): Promise<boolean> {
  const rows = await db
    .select({ enabled: corpStructureSharing.enabled })
    .from(corpStructureSharing)
    .where(eq(corpStructureSharing.corporationId, corporationId))
    .limit(1);
  return rows[0]?.enabled ?? false;
}

export async function readCorpStructureSharings(
  corporationIds: number[],
): Promise<Map<number, CorpStructureSharingState>> {
  if (corporationIds.length === 0) return new Map();
  const rows = await db
    .select({
      corporationId: corpStructureSharing.corporationId,
      enabled: corpStructureSharing.enabled,
      setBy: corpStructureSharing.setBy,
      setAt: corpStructureSharing.setAt,
    })
    .from(corpStructureSharing)
    .where(inArray(corpStructureSharing.corporationId, corporationIds));
  return new Map(rows.map((r) => [r.corporationId, { enabled: r.enabled, setBy: r.setBy, setAt: r.setAt }]));
}

export async function setCorpStructureSharing(
  corporationId: number,
  enabled: boolean,
  setBy: number | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(corpStructureSharing)
    .values({ corporationId, enabled, setBy, setAt: now })
    .onConflictDoUpdate({
      target: corpStructureSharing.corporationId,
      set: { enabled, setBy, setAt: now },
    });
  if (enabled) return;
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  await db.delete(corpStructureSyncs).where(eq(corpStructureSyncs.corporationId, corporationId));
  await db.delete(corpStructureRigs).where(eq(corpStructureRigs.corporationId, corporationId));
  revalidateTag(corpStructuresTag(corporationId), 'max');
}

export interface CorpStructureCompletion {
  rigTypeIds: number[];
  taxPct: number | null;
}

export async function getCorpStructureRigs(
  corporationIds: number[],
): Promise<Map<number, CorpStructureCompletion>> {
  if (corporationIds.length === 0) return new Map();
  const rows = await db
    .select({
      structureId: corpStructureRigs.structureId,
      rigTypeIds: corpStructureRigs.rigTypeIds,
      taxPct: corpStructureRigs.taxPct,
    })
    .from(corpStructureRigs)
    .where(inArray(corpStructureRigs.corporationId, corporationIds));
  return new Map(rows.map((r) => [r.structureId, { rigTypeIds: r.rigTypeIds, taxPct: r.taxPct }]));
}

/**
 * Record one structure's authored completion (the Station_Manager's input — ESI
 * exposes neither the rigs nor the profile tax). Untouched by the full-replace pull
 * (saveCorpStructures never references this table), so the authored values survive
 * the hourly refresh. `taxPct` is tri-state: undefined leaves the stored tax as-is
 * (a rig-only save can't clobber it), null clears it, a number sets it.
 */
export async function upsertCorpStructureRigs(
  corporationId: number,
  structureId: number,
  rigTypeIds: number[],
  taxPct?: number | null,
): Promise<void> {
  const taxSet = taxPct === undefined ? {} : { taxPct };
  await db
    .insert(corpStructureRigs)
    .values({ corporationId, structureId, rigTypeIds, ...taxSet, setAt: new Date() })
    .onConflictDoUpdate({
      target: [corpStructureRigs.corporationId, corpStructureRigs.structureId],
      set: { rigTypeIds, ...taxSet, setAt: new Date() },
    });
  revalidateTag(corpStructuresTag(corporationId), 'max');
}
