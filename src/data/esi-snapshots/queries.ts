import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { esiSnapshots } from './schema';
import type { InsertEsiSnapshotInput } from './types';

/**
 * Stores one encrypted raw ESI response snapshot with its owner, request hash, source headers, and
 * absolute capture time.
 */
export async function insertEsiSnapshot(input: InsertEsiSnapshotInput): Promise<number> {
  const rows = await db.insert(esiSnapshots).values(input).returning({ id: esiSnapshots.id });
  const row = rows[0];
  if (row === undefined) throw new Error('ESI snapshot insert returned no id');
  return row.id;
}

/** Deletes one snapshot by ID only when no current projection references it. */
export async function deleteEsiSnapshot(id: number): Promise<void> {
  await db.delete(esiSnapshots).where(eq(esiSnapshots.id, id));
}
