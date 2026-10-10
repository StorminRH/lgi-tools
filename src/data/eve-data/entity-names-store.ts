import { inArray, lt } from 'drizzle-orm';
import { db } from '@/db';
import { chunk } from '@/lib/array';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';
import { excludedSet } from '@/lib/db-upsert';
import { eveEntityNames } from './schema';

/** Rows untouched this long are pruned; any id still in use is re-resolved before then. */
export const ENTITY_NAME_RETENTION_DAYS = 30;

const STORE_CHUNK = 1000;

export interface StoredEntityName {
  /** Null when ESI could not resolve the id. */
  name: string | null;
  category: string | null;
  resolvedAt: Date;
}

export interface EntityNameRow {
  id: number;
  name: string | null;
  category: string | null;
}

/** The stored answer for each id that has one. */
export async function readStoredEntityNames(
  ids: readonly number[],
): Promise<Map<number, StoredEntityName>> {
  const stored = new Map<number, StoredEntityName>();
  for (const batch of chunk(ids, STORE_CHUNK)) {
    const rows = await db
      .select({
        id: eveEntityNames.id,
        name: eveEntityNames.name,
        category: eveEntityNames.category,
        resolvedAt: eveEntityNames.resolvedAt,
      })
      .from(eveEntityNames)
      .where(inArray(eveEntityNames.id, batch));
    for (const { id, ...answer } of rows) stored.set(id, answer);
  }
  return stored;
}

/**
 * Records ESI's answers, replacing older ones for the same ids. Rows go in id
 * order, so two overlapping saves lock the same rows in the same order rather
 * than deadlocking.
 */
export async function storeEntityNames(rows: readonly EntityNameRow[], resolvedAt: Date): Promise<void> {
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  for (const batch of chunk(ordered, STORE_CHUNK)) {
    await db
      .insert(eveEntityNames)
      .values(batch.map((row) => ({ ...row, resolvedAt })))
      .onConflictDoUpdate({
        target: eveEntityNames.id,
        set: excludedSet(eveEntityNames, ['name', 'category', 'resolvedAt']),
      });
  }
}

export function pruneEntityNames(
  database: AnyPgDb,
  retentionDays: number,
  now: Date,
  deadline?: number,
): Promise<BatchedDeleteResult> {
  return deleteInBatches(
    database,
    eveEntityNames,
    lt(eveEntityNames.resolvedAt, retentionCutoff(retentionDays, now)),
    deadline,
  );
}
