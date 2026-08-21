import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, QueryCtx } from '../_generated/server';
import { authenticatedSubject } from './characterSync';

export type UserIndexedTable =
  | 'characterLocation'
  | 'characterOnline'
  | 'characterLocationAccess';
export type UserCharacterIndexedTable =
  | 'characterLocation'
  | 'characterLocationCovered';
export type UserDatasetTable = 'syncSubjects' | 'syncPresence';
export type PurgeAfterTable = 'mapSystems' | 'mapConnections';
export type StoredDataset = Doc<'syncSubjects'>['dataset'];

export function collectByUser(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'characterLocation',
  userId: string,
): Promise<Doc<'characterLocation'>[]>;
export function collectByUser(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'characterOnline',
  userId: string,
): Promise<Doc<'characterOnline'>[]>;
export function collectByUser(
  ctx: Pick<QueryCtx, 'db'>,
  table: 'characterLocationAccess',
  userId: string,
): Promise<Doc<'characterLocationAccess'>[]>;
export function collectByUser(
  ctx: Pick<QueryCtx, 'db'>,
  table: UserIndexedTable,
  userId: string,
) {
  switch (table) {
    case 'characterLocation':
      return ctx.db
        .query('characterLocation')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect();
    case 'characterOnline':
      return ctx.db
        .query('characterOnline')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect();
    case 'characterLocationAccess':
      return ctx.db
        .query('characterLocationAccess')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect();
  }
}

export async function viewerUserDocs<TDoc, TCharacter>(
  ctx: QueryCtx,
  loadDocs: (userId: string) => Promise<readonly TDoc[]>,
  mapDoc: (doc: TDoc) => TCharacter,
): Promise<{ characters: TCharacter[] } | null> {
  const userId = await authenticatedSubject(ctx);
  if (userId === null) return null;
  const docs = await loadDocs(userId);
  return { characters: docs.map(mapDoc) };
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
        q.gt('purgeAfter', null).lte('purgeAfter', now),
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
