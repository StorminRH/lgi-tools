import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, QueryCtx } from '../_generated/server';

export type UserCharacterTable =
  | 'characterLocation'
  | 'characterLocationCovered'
  | 'characterLocationOnline'
  | 'characterLocationAccess';
export type PurgeAfterTable = 'mapSystems' | 'mapConnections';

/** The one row a (user, character) pair holds in a single-row location table. */
export function uniqueByUserCharacter<T extends UserCharacterTable>(
  ctx: Pick<QueryCtx, 'db'>,
  table: T,
  userId: string,
  characterId: number,
): Promise<Doc<T> | null> {
  // The query runs over the union so withIndex resolves; the cast narrows the row back to T.
  return ctx.db
    .query(table as UserCharacterTable)
    .withIndex('by_user_character', (q) =>
      q.eq('userId', userId).eq('characterId', characterId),
    )
    .unique() as Promise<Doc<T> | null>;
}

export function uniqueByUserDataset(
  db: DatabaseReader,
  dataset: Doc<'syncPresence'>['dataset'],
  userId: string,
): Promise<Doc<'syncPresence'> | null> {
  return db
    .query('syncPresence')
    .withIndex('by_user_dataset', (q) =>
      q.eq('userId', userId).eq('dataset', dataset),
    )
    .unique();
}

export function takeExpiredByPurgeAfter(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'mapSystems',
  now: number,
  limit: number,
): Promise<Doc<'mapSystems'>[]>;
export function takeExpiredByPurgeAfter(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'mapConnections',
  now: number,
  limit: number,
): Promise<Doc<'mapConnections'>[]>;
export function takeExpiredByPurgeAfter(
  ctx: Pick<QueryCtx, 'db'>,
  table: PurgeAfterTable,
  now: number,
  limit: number,
) {
  const query = table === 'mapSystems'
    ? ctx.db.query('mapSystems').withIndex('by_purge_after', (q) =>
        q.gt('purgeAfter', null).lte('purgeAfter', now),
      )
    : ctx.db.query('mapConnections').withIndex('by_purge_after', (q) =>
        q.gt('tombstone.purgeAfter', null).lte('tombstone.purgeAfter', now),
      );
  return query.take(limit);
}

export function queryMapSignatures(ctx: Pick<QueryCtx, 'db'>, mapId: string, systemId: number) {
  return ctx.db.query('mapSignatures').withIndex('by_map_signature', (q) =>
    q.eq('mapId', mapId).eq('systemId', systemId),
  );
}

export function queryMapSignatureActivity(ctx: Pick<QueryCtx, 'db'>, mapId: string, systemId: number) {
  return ctx.db.query('mapSignatureActivity').withIndex('by_map_signature', (q) =>
    q.eq('mapId', mapId).eq('systemId', systemId),
  );
}

export async function takeIndexedOrThrow<T>(
  query: { take: (n: number) => Promise<T[]> },
  cap: number,
  error: { code: string; detail: string },
): Promise<T[]> {
  const rows = await query.take(cap + 1);
  if (rows.length > cap) {
    throw new ConvexError({ code: error.code, detail: error.detail });
  }
  return rows;
}

export interface IndexedBatchDeleteResult {
  readonly deleted: number;
  readonly hasMore: boolean;
}

/**
 * Removes up to `limit` rows in index order; `hasMore` is true while rows
 * remain. Rows go one at a time, so a remover may read what earlier removals
 * in the batch left behind.
 */
export async function deleteIndexedBatch<T>(
  query: { take: (n: number) => Promise<T[]> },
  limit: number,
  remove: (row: T) => Promise<unknown>,
): Promise<IndexedBatchDeleteResult> {
  const rows = await query.take(limit + 1);
  const doomed = rows.slice(0, limit);
  for (const row of doomed) {
    await remove(row);
  }
  return { deleted: doomed.length, hasMore: rows.length > limit };
}
