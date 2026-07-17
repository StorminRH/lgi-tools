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
import { corpStructureRigs, corpStructures, corpStructureSharing, corpStructureSyncs } from './schema';
import type { CorpStructureRow, CorpStructureSharingState, CorpStructuresSyncState } from './types';

/** One cache tag per corp so a refresh busts exactly that corp's cached read. */
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

/**
 * The owned structures for each given corp (the caller resolves which corps the
 * viewer may see — via the 3.7.3 corp-access membership gate — and passes them in,
 * since owner resolution needs auth a feature slice may not import). Composes the
 * cached per-corp reads into one corp-keyed map.
 */
export async function getCorpStructures(
  corporationIds: number[],
): Promise<Map<number, CorpStructureRow[]>> {
  const perCorp = await Promise.all(
    corporationIds.map(async (corpId) => [corpId, await getCorpStructureRows(corpId)] as const),
  );
  return new Map(perCorp);
}

/**
 * Live (uncached) sync state for the staleness gate + etag replay. Uncached on
 * purpose: the refresh needs the true last-refreshed time, not a cached view.
 */
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

/**
 * The freshness "as of" per corp for the read seam (which corps render + when each
 * was last synced). Uncached — the read seam wants the true stamp.
 */
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

/**
 * Replace-all write-behind. Sequential (no transaction — the request path runs on
 * the neon-http driver, which has none): derive the bands, delete the corp's rows,
 * insert the fresh set, then stamp the sync row LAST. Stamping last means a partial
 * failure leaves the corp stale, so the next view simply refetches (self-healing).
 */
export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {
  // Consent re-check immediately before the write (the resurrection guard): a
  // write-behind refresh that began while sharing was ON can finish its ESI fetch
  // AFTER a disable wiped the corp; without this re-read it would re-insert + re-stamp
  // the wiped catalogue. Disable flips consent OFF first, so this read sees OFF and
  // no-ops the save — the window collapses to two sequential statements.
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

/**
 * The 304 path: bump freshness only, leaving stored rows + held etags untouched
 * (the data is unchanged, so no revalidate). The sync row always exists here — a
 * 304 can only follow a prior fresh save that stored the replayed etags.
 */
export async function stampCorpStructuresFresh(corporationId: number): Promise<void> {
  await db
    .update(corpStructureSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(corpStructureSyncs.corporationId, corporationId));
}

// ── Sharing consent (the app-authored system-of-record) ──────────────────────────

/**
 * Whether a corp has opted in to sharing. Default OFF: no row ⇒ false. Read by the
 * engine's precondition (before any vend) AND the read-side filter (below).
 */
export async function isCorpStructureSharingEnabled(corporationId: number): Promise<boolean> {
  const rows = await db
    .select({ enabled: corpStructureSharing.enabled })
    .from(corpStructureSharing)
    .where(eq(corpStructureSharing.corporationId, corporationId))
    .limit(1);
  return rows[0]?.enabled ?? false;
}

/**
 * The sharing state for a set of corps (the structures page reads all member corps'
 * state at once). A corp with no row defaults to disabled.
 */
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

/**
 * Flip a corp's sharing consent. ENABLE just upserts enabled=true — the next member
 * view re-pulls cold (the precondition now passes and the wiped sync row makes the
 * catalogue stale). DISABLE wipes: flip enabled=false FIRST (so the precondition + the
 * read filter + the save re-check all fail closed immediately), THEN delete the corp's
 * regenerable rows + sync state + authored rigs, THEN bust the cached read. Sequential,
 * not transactional — the request path is the neon-http driver, which has none (the
 * saveCorpStructures precedent); flip-consent-first makes the deletes idempotent
 * cleanup, and the read-side consent filter hides any residue from a partial wipe.
 */
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

// ── Authored completions (app-authored; survive the full-replace pull) ────────────

/**
 * The authored completion (rig fit + facility tax) for a set of corps, keyed by
 * structureId (globally unique in EVE, so no cross-corp collision). A structure with
 * no row contributes no rigs and no tax (the fee path then assumes the NPC baseline).
 */
export interface CorpStructureCompletion {
  rigTypeIds: number[];
  taxPct: number | null;
}

/** Loads fitted rig type IDs for the requested corporation structures in one batched query. */
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
