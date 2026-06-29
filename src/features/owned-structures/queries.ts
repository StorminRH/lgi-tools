// Neon read/write for corp owned structures (3.7.9). The cached per-corp read is
// the consumer surface (the planner's build-location selector, next session); the
// write-behind half (replace-all + freshness stamp) and the live sync-state read
// serve the on-view refresh. Validation lives upstream (the ESI projection); these
// accept already-typed values. DB-bound accessor — covered via integration + the
// consuming refresh, per the queries.ts policy. A direct mirror of the owned-assets
// queries, corp-keyed, with the security band derived from the SDE at write.
import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { eveSolarSystems } from '@/data/eve-data/schema';
import { type SecurityClass, systemSecurityClass } from '@/data/eve-data/security';
import type { ParsedCorpStructure } from './esi-projection';
import { corpStructures, corpStructureSyncs } from './schema';
import type { CorpStructureRow, CorpStructuresSyncState } from './types';

// One cache tag per corp so a refresh busts exactly that corp's cached read.
export function corpStructuresTag(corporationId: number): string {
  return `corp-structures:${corporationId}`;
}

// Cached per-corp structures — one corporation's full owned set. One cache entry +
// tag per corp is the high-hit-rate key; cacheLife('hours') gives sub-window
// freshness and the write-behind's revalidateTag busts it the moment a refresh
// persists new rows.
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

// The owned structures for each given corp (the caller resolves which corps the
// viewer may see — via the 3.7.3 corp-access membership gate — and passes them in,
// since owner resolution needs auth a feature slice may not import). Composes the
// cached per-corp reads into one corp-keyed map.
export async function getCorpStructures(
  corporationIds: number[],
): Promise<Map<number, CorpStructureRow[]>> {
  const perCorp = await Promise.all(
    corporationIds.map(async (corpId) => [corpId, await getCorpStructureRows(corpId)] as const),
  );
  return new Map(perCorp);
}

// Live (uncached) sync state for the staleness gate + etag replay. Uncached on
// purpose: the refresh needs the true last-refreshed time, not a cached view.
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

// The freshness "as of" per corp for the read seam (which corps render + when each
// was last synced). Uncached — the read seam wants the true stamp.
export async function listCorpStructureSyncStates(
  corporationIds: number[],
): Promise<{ corporationId: number; lastRefreshedAt: Date }[]> {
  if (corporationIds.length === 0) return [];
  return db
    .select({ corporationId: corpStructureSyncs.corporationId, lastRefreshedAt: corpStructureSyncs.lastRefreshedAt })
    .from(corpStructureSyncs)
    .where(inArray(corpStructureSyncs.corporationId, corporationIds));
}

// Derive each structure's security band from its system's SDE security status +
// wormhole class, in one batched lookup over the distinct system ids. A system the
// SDE doesn't know (shouldn't happen) defaults to hi-sec via systemSecurityClass.
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

// Replace-all write-behind. Sequential (no transaction — the request path runs on
// the neon-http driver, which has none): derive the bands, delete the corp's rows,
// insert the fresh set, then stamp the sync row LAST. Stamping last means a partial
// failure leaves the corp stale, so the next view simply refetches (self-healing).
export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {
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

// The 304 path: bump freshness only, leaving stored rows + held etags untouched
// (the data is unchanged, so no revalidate). The sync row always exists here — a
// 304 can only follow a prior fresh save that stored the replayed etags.
export async function stampCorpStructuresFresh(corporationId: number): Promise<void> {
  await db
    .update(corpStructureSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(corpStructureSyncs.corporationId, corporationId));
}
