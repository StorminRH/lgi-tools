import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import { esiSnapshots } from './schema';
import type { InsertEsiSnapshotInput } from './types';

export async function insertEsiSnapshot(input: InsertEsiSnapshotInput): Promise<number> {
  const rows = await db.insert(esiSnapshots).values(input).returning({ id: esiSnapshots.id });
  const row = rows[0];
  if (row === undefined) throw new Error('ESI snapshot insert returned no id');
  return row.id;
}

export async function deleteEsiSnapshot(id: number): Promise<void> {
  await db.delete(esiSnapshots).where(eq(esiSnapshots.id, id));
}

/** Immutable source bodies, scoped to their corporation and assets endpoint. */
export async function readCorpAssetSnapshots(corporationId: number, ids: number[]) {
  if (ids.length === 0) return [];
  return db.select({ id: esiSnapshots.id, bodyCiphertext: esiSnapshots.bodyCiphertext })
    .from(esiSnapshots)
    .where(and(
      inArray(esiSnapshots.id, ids),
      ownerKeyWhere(esiSnapshots, { ownerType: 'corporation', ownerId: corporationId }),
      eq(esiSnapshots.endpoint, `/corporations/${corporationId}/assets/`),
    ));
}
