import { inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { deleteInBatches, retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import type { AnyPgDb } from '@/lib/db-types';
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

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += STORE_CHUNK) out.push(items.slice(i, i + STORE_CHUNK));
  return out;
}

/** The stored answer for each id that has one. */
export async function readStoredEntityNames(
  ids: readonly number[],
): Promise<Map<number, StoredEntityName>> {
  const stored = new Map<number, StoredEntityName>();
  for (const chunk of chunks(ids)) {
    const rows = await db
      .select({
        id: eveEntityNames.id,
        name: eveEntityNames.name,
        category: eveEntityNames.category,
        resolvedAt: eveEntityNames.resolvedAt,
      })
      .from(eveEntityNames)
      .where(inArray(eveEntityNames.id, chunk));
    for (const { id, ...answer } of rows) stored.set(id, answer);
  }
  return stored;
}

function excluded(column: { name: string }) {
  return sql.raw(`excluded.${column.name}`);
}

/** Records ESI's answers, replacing older ones for the same ids. */
export async function storeEntityNames(rows: readonly EntityNameRow[], resolvedAt: Date): Promise<void> {
  for (const chunk of chunks(rows)) {
    await db
      .insert(eveEntityNames)
      .values(chunk.map((row) => ({ ...row, resolvedAt })))
      .onConflictDoUpdate({
        target: eveEntityNames.id,
        set: {
          name: excluded(eveEntityNames.name),
          category: excluded(eveEntityNames.category),
          resolvedAt: excluded(eveEntityNames.resolvedAt),
        },
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
