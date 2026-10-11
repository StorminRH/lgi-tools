import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { getSystemFacts } from '@/data/eve-data/character-facts';
import { systemSecurityClass } from '@/data/eve-data/security';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import type { ParsedCorpStructure } from './esi-projection';
import { corpStructureRigs, corpStructures, corpStructureSyncs } from './schema';
import type { CorpStructureRow, CorpStructuresSyncState } from './types';

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
  return mapByIdDroppingNulls(corporationIds, getCorpStructureRows);
}

export async function readCorpStructureSyncState(
  corporationId: number,
): Promise<CorpStructuresSyncState | null> {
  const rows = await db
    .select({ lastRefreshedAt: corpStructureSyncs.lastRefreshedAt, pageEtags: corpStructureSyncs.pageEtags })
    .from(corpStructureSyncs)
    .where(eq(corpStructureSyncs.corporationId, corporationId))
    .limit(1);
  return rows[0] ?? null;
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

export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {
  const now = new Date();
  const systems = await getSystemFacts([...new Set(rows.map((r) => r.system_id))]);
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  if (rows.length > 0) {
    await db.insert(corpStructures).values(
      rows.map((r) => ({
        corporationId,
        structureId: r.structure_id,
        typeId: r.type_id,
        systemId: r.system_id,
        securityClass: systems.get(r.system_id)?.secClass ?? systemSecurityClass(null, null),
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
