import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, QueryCtx } from '../_generated/server';

export type UserCharacterIndexedTable =
  | 'characterLocation'
  | 'characterLocationCovered';
export type UserDatasetTable = 'syncSubjects' | 'syncPresence';
export type PurgeAfterTable = 'mapSystems' | 'mapConnections';
export type StoredDataset = Doc<'syncSubjects'>['dataset'];

export function collectByUser(
  db: DatabaseReader,
  table: 'characterLocationAccess',
  userId: string,
): Promise<Doc<'characterLocationAccess'>[]>;
export function collectByUser(
  db: DatabaseReader,
  table: 'mapTracking',
  userId: string,
): Promise<Doc<'mapTracking'>[]>;
export function collectByUser(
  db: DatabaseReader,
  table: 'characterLocationAccess' | 'mapTracking',
  userId: string,
) {
  return db.query(table)
    .withIndex('by_user_character', (q) => q.eq('userId', userId))
    .collect();
}

export function uniqueByUserCharacter(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'characterLocation',
  userId: string,
  characterId: number,
): Promise<Doc<'characterLocation'> | null>;
export function uniqueByUserCharacter(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'characterLocationCovered',
  userId: string,
  characterId: number,
): Promise<Doc<'characterLocationCovered'> | null>;
export function uniqueByUserCharacter(
  ctx: Pick<QueryCtx, 'db'>,
  table: UserCharacterIndexedTable,
  userId: string,
  characterId: number,
) {
  switch (table) {
    case 'characterLocation':
      return ctx.db
        .query('characterLocation')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', userId).eq('characterId', characterId),
        )
        .unique();
    case 'characterLocationCovered':
      return ctx.db
        .query('characterLocationCovered')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', userId).eq('characterId', characterId),
        )
        .unique();
  }
}

export function uniqueByUserDataset(
  db: DatabaseReader,
  table: 'syncSubjects',
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncSubjects'> | null>;
export function uniqueByUserDataset(
  db: DatabaseReader,
  table: 'syncPresence',
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncPresence'> | null>;
export function uniqueByUserDataset(
  db: DatabaseReader,
  table: UserDatasetTable,
  dataset: StoredDataset,
  userId: string,
) {
  switch (table) {
    case 'syncSubjects':
      return db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', userId).eq('dataset', dataset),
        )
        .unique();
    case 'syncPresence':
      return db
        .query('syncPresence')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', userId).eq('dataset', dataset),
        )
        .unique();
  }
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
