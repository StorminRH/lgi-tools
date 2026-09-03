import { eq } from 'drizzle-orm';
import { db } from '@/db';
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
