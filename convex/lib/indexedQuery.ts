import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, QueryCtx } from '../_generated/server';
import { authenticatedSubject } from './characterSync';

type UserIndexedTable = 'characterLocation' | 'characterOnline' | 'characterLocationAccess';

type IndexRange = {
  eq: (field: string, value: unknown) => IndexRange;
  gt: (field: string, value: unknown) => IndexRange;
  lte: (field: string, value: unknown) => IndexRange;
};

type IndexedQuery<TDoc> = {
  withIndex: (
    name: string,
    fn: (q: IndexRange) => IndexRange,
  ) => {
    collect: () => Promise<TDoc[]>;
    take: (n: number) => Promise<TDoc[]>;
    unique: () => Promise<TDoc | null>;
  };
};

function asIndexed<TDoc>(query: unknown): IndexedQuery<TDoc> {
  return query as IndexedQuery<TDoc>;
}

/** Collects every `by_user` row for one user on a user-keyed table. */
export async function collectByUser<T extends UserIndexedTable>(
  ctx: Pick<QueryCtx, 'db'>,
  table: T,
  userId: string,
): Promise<Doc<T>[]> {
  return asIndexed<Doc<T>>(ctx.db.query(table))
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
}

/**
 * Viewer queries that return null for an anonymous subject, otherwise the
 * caller's `by_user` docs mapped into the published character list.
 */
export async function viewerUserDocs<T extends UserIndexedTable, TCharacter>(
  ctx: QueryCtx,
  table: T,
  mapDoc: (doc: Doc<T>) => TCharacter,
): Promise<{ characters: TCharacter[] } | null> {
  const userId = await authenticatedSubject(ctx);
  if (userId === null) return null;
  const docs = await collectByUser(ctx, table, userId);
  return { characters: docs.map(mapDoc) };
}

type UserDatasetTable = 'syncSubjects' | 'syncPresence';
type UserCharacterIndexedTable = 'characterLocation' | 'characterLocationCovered';
type PurgeAfterTable = 'mapSystems' | 'mapConnections';
type MapSignatureTable = 'mapSignatures' | 'mapSignatureActivity';
type StoredDataset = Doc<'syncSubjects'>['dataset'];

/** Reads the unique row for one user and character from a live location table. */
export function uniqueByUserCharacter<T extends UserCharacterIndexedTable>(
  ctx: Pick<QueryCtx, 'db'>,
  table: T,
  userId: string,
  characterId: number,
): Promise<Doc<T> | null> {
  return asIndexed<Doc<T>>(ctx.db.query(table))
    .withIndex('by_user_character', (q) =>
      q.eq('userId', userId).eq('characterId', characterId),
    )
    .unique();
}

/** Reads the unique subject or presence row for one user and stored dataset. */
export function uniqueByUserDataset<T extends UserDatasetTable>(
  db: DatabaseReader,
  table: T,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<T> | null> {
  return asIndexed<Doc<T>>(db.query(table))
    .withIndex('by_user_dataset', (q) => q.eq('userId', userId).eq('dataset', dataset))
    .unique();
}

/** Takes expired purgeAfter rows for one chain-cleanup table. */
export function takeExpiredByPurgeAfter<T extends PurgeAfterTable>(
  ctx: Pick<QueryCtx, 'db'>,
  table: T,
  now: number,
  limit: number,
): Promise<Doc<T>[]> {
  return asIndexed<Doc<T>>(ctx.db.query(table))
    .withIndex('by_purge_after', (q) => q.gt('purgeAfter', null).lte('purgeAfter', now))
    .take(limit);
}

/** Indexed map-signature or activity rows for one system. */
export function queryByMapSignature<T extends MapSignatureTable>(
  ctx: Pick<QueryCtx, 'db'>,
  table: T,
  mapId: string,
  systemId: number,
) {
  return asIndexed<Doc<T>>(ctx.db.query(table)).withIndex('by_map_signature', (q) =>
    q.eq('mapId', mapId).eq('systemId', systemId),
  );
}

/** Takes one extra indexed row and throws when the caller-supplied cap is exceeded. */
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
