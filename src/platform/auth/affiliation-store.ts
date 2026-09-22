import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account, characters, corpAccessAudit } from '@/db/auth-schema';
import {
  enqueuePendingMapAccessSelection,
  type PendingMapAccessChange,
} from '@/data/maps/authorization-sql';
import { mapAccess, pendingMapAccessChanges } from '@/data/maps/schema';
import type { AnyPgDb } from '@/lib/db-types';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AffiliationRow } from './affiliation-source';
import { characterProfileJoin, parseLinkedAccountId } from './eve-account-shared';
import { EVE_PROVIDER_ID } from './eve-sso';

export interface CachedAffiliation {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  refreshedAt: Date | null;
}

export type { PendingMapAccessChange };

export const MAX_PENDING_BATCH = 100;
const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

function rowToCachedAffiliation(
  characterId: number,
  row: {
    corporationId: number | null;
    allianceId: number | null;
    factionId: number | null;
    refreshedAt: Date | null;
  },
): CachedAffiliation {
  return {
    characterId,
    corporationId: row.corporationId ?? null,
    allianceId: row.allianceId ?? null,
    factionId: row.factionId ?? null,
    refreshedAt: row.refreshedAt ?? null,
  };
}

export async function getUserAffiliations(userId: string): Promise<CachedAffiliation[]> {
  return (await getUsersAffiliations([userId])).map(({ userId: _userId, ...affiliation }) => affiliation);
}

export async function getUsersAffiliations(
  userIds: readonly string[],
): Promise<(CachedAffiliation & { userId: string })[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      userId: account.userId,
      accountId: account.accountId,
      corporationId: characters.corporationId,
      allianceId: characters.allianceId,
      factionId: characters.factionId,
      refreshedAt: characters.affiliationRefreshedAt,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(and(inArray(account.userId, [...userIds]), eq(account.providerId, EVE_PROVIDER_ID)))
    .orderBy(asc(account.userId), asc(account.accountId));

  return rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null ? [] : [{ userId: r.userId, ...rowToCachedAffiliation(characterId, r) }];
  });
}

export async function listStaleLinkedCharacterIds(): Promise<number[]> {
  const cutoff = new Date(Date.now() - AFFILIATION_FRESHNESS.ttlMs);
  const rows = await db
    .selectDistinct({ accountId: account.accountId })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        or(
          isNull(characters.affiliationRefreshedAt),
          lt(characters.affiliationRefreshedAt, cutoff),
        ),
      ),
    );
  return rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null ? [] : [characterId];
  });
}

function formatAffiliationObservedAt(observedAt: Date | string): string {
  if (typeof observedAt === 'string') return observedAt;
  return observedAt.toISOString().replace('T', ' ').replace('Z', '');
}

export async function captureAffiliationObservedAt(): Promise<string> {
  const result = await db.execute<{ now: string }>(sql`
    SELECT to_char(timezone('utc', clock_timestamp()), 'YYYY-MM-DD HH24:MI:SS.US') AS now
  `);
  const rows = Array.isArray(result) ? result : result.rows;
  const now = rows[0]?.now;
  if (typeof now !== 'string' || now.length === 0) {
    throw new Error('Affiliation observation clock returned an invalid timestamp.');
  }
  return now;
}

export async function updateAffiliations(
  rows: AffiliationRow[],
  observedAt: Date | string,
): Promise<{
  refreshed: number;
  accessChanged: boolean;
}> {
  if (rows.length === 0) return { refreshed: 0, accessChanged: false };
  const incoming = [...new Map(rows.map((row) => [row.characterId, row])).values()];
  const now = new Date();
  const cutoff = new Date(now.getTime() - AFFILIATION_FRESHNESS.ttlMs);
  const nowIso = now.toISOString().replace('T', ' ').replace('Z', '');
  const observedIso = formatAffiliationObservedAt(observedAt);
  const cutoffIso = cutoff.toISOString().replace('T', ' ').replace('Z', '');
  const result = await db.execute<{
    refreshed: number;
    accessChanged: boolean;
  }>(sql`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(incoming)}::jsonb)
        AS r("characterId" bigint, "corporationId" bigint, "allianceId" bigint, "factionId" bigint)
    ), previous AS MATERIALIZED (
      SELECT c.character_id, c.corporation_id, c.affiliation_refreshed_at
      FROM ${characters} c JOIN incoming i ON i."characterId" = c.character_id
      ORDER BY c.character_id FOR UPDATE OF c
    ), updated AS (
      UPDATE ${characters} c
      SET corporation_id = i."corporationId", alliance_id = i."allianceId",
          faction_id = i."factionId", affiliation_refreshed_at = ${observedIso}::timestamp,
          updated_at = ${nowIso}::timestamp
      FROM incoming i JOIN previous p ON p.character_id = i."characterId"
      WHERE c.character_id = i."characterId"
        AND (c.affiliation_refreshed_at IS NULL OR c.affiliation_refreshed_at < ${observedIso}::timestamp)
      RETURNING c.*, p.corporation_id AS previous_corporation_id,
                p.affiliation_refreshed_at AS previous_refreshed_at
    ), changed AS (
      SELECT * FROM updated WHERE previous_corporation_id IS DISTINCT FROM corporation_id
        OR previous_refreshed_at IS NULL OR previous_refreshed_at < ${cutoffIso}::timestamp
    ), queued AS (
      ${enqueuePendingMapAccessSelection(sql`
        SELECT DISTINCT grants.map_id FROM (
          SELECT previous_corporation_id AS corporation_id FROM changed
          UNION ALL
          SELECT corporation_id FROM changed
        ) changed JOIN ${mapAccess} grants
          ON grants.owner_type = 'corporation' AND grants.owner_id = changed.corporation_id
        ORDER BY grants.map_id
      `)}
    )
    SELECT count(*)::integer AS "refreshed",
           EXISTS (SELECT 1 FROM queued) AS "accessChanged"
    FROM updated
  `);
  const persisted = Array.isArray(result) ? result : result.rows;
  return {
    accessChanged: persisted[0]?.accessChanged ?? false,
    refreshed: persisted[0]?.refreshed ?? 0,
  };
}

export async function readPendingMapAccessChanges(
  limit = MAX_PENDING_BATCH,
): Promise<PendingMapAccessChange[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PENDING_BATCH) {
    throw new RangeError(`Pending affiliation batch must be between 1 and ${MAX_PENDING_BATCH}`);
  }
  return db.select({
    mapId: pendingMapAccessChanges.mapId,
    version: pendingMapAccessChanges.version,
  }).from(pendingMapAccessChanges)
    .orderBy(asc(pendingMapAccessChanges.queuedAt), asc(pendingMapAccessChanges.mapId))
    .limit(limit);
}

export async function enqueueMapAccessChanges(mapIds: readonly string[]): Promise<PendingMapAccessChange[]> {
  const unique = [...new Set(mapIds)];
  if (unique.length === 0) return [];
  return db
    .insert(pendingMapAccessChanges)
    .values(unique.map((mapId) => ({ mapId })))
    .onConflictDoUpdate({
      target: pendingMapAccessChanges.mapId,
      set: { version: sql`gen_random_uuid()` },
    })
    .returning({ mapId: pendingMapAccessChanges.mapId, version: pendingMapAccessChanges.version });
}

export async function acknowledgeMapAccessChanges(
  changes: PendingMapAccessChange[],
  retry: PendingMapAccessChange[] = [],
): Promise<void> {
  if (changes.length + retry.length === 0) return;
  if (changes.length + retry.length > MAX_PENDING_BATCH) throw new RangeError('Pending affiliation batch exceeds limit');
  const seen = new Set(changes.map((row) => `${row.mapId}:${row.version}`));
  if (retry.some((row) => seen.has(`${row.mapId}:${row.version}`))) {
    throw new RangeError('Pending affiliation batch must not overlap completed and retried work');
  }
  await db.execute(sql`
    WITH retried AS (
      UPDATE ${pendingMapAccessChanges} pending SET queued_at = clock_timestamp()
      FROM jsonb_to_recordset(${JSON.stringify(retry)}::jsonb)
        AS failed("mapId" uuid, version uuid)
      WHERE pending.map_id = failed."mapId" AND pending.version = failed.version
    )
    DELETE FROM ${pendingMapAccessChanges} pending
    USING jsonb_to_recordset(${JSON.stringify(changes)}::jsonb)
      AS completed("mapId" uuid, version uuid)
    WHERE pending.map_id = completed."mapId" AND pending.version = completed.version
  `);
}

export async function recordCorpAccessDecision(entry: {
  userId: string;
  corporationId: number;
  characterId: number | null;
  allowed: boolean;
  reason: string;
}): Promise<void> {
  await db.insert(corpAccessAudit).values(entry);
}

export async function pruneCorpAccessAudit(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(corpAccessAudit).where(lt(corpAccessAudit.decidedAt, cutoff));
}
