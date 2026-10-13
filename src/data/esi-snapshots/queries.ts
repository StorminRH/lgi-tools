import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { AnyPgDb } from '@/lib/db-types';
import { esiSnapshots } from './schema';
import type { InsertEsiSnapshotInput } from './types';

/** Keeps one source body; an owner sync passes the transaction its publication commits in. */
export async function insertEsiSnapshot(input: InsertEsiSnapshotInput, database: AnyPgDb = db): Promise<number> {
  const rows = await database.insert(esiSnapshots).values(input).returning({ id: esiSnapshots.id });
  const row = rows[0];
  if (row === undefined) throw new Error('ESI snapshot insert returned no id');
  return row.id;
}

/** Immutable source bodies, scoped to their corporation and the endpoint the sync stored them under. */
export async function readCorpAssetSnapshots(corporationId: number, endpoint: string, ids: number[]) {
  if (ids.length === 0) return [];
  return db.select({ id: esiSnapshots.id, bodyCiphertext: esiSnapshots.bodyCiphertext })
    .from(esiSnapshots)
    .where(and(
      inArray(esiSnapshots.id, ids),
      ownerKeyWhere(esiSnapshots, { ownerType: 'corporation', ownerId: corporationId }),
      eq(esiSnapshots.endpoint, endpoint),
    ));
}
