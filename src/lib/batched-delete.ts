import { sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { AnyPgDb } from '@/lib/db-types';
import { daysBefore } from '@/lib/iso-date';

const DELETE_BATCH_SIZE = 5000;

export interface BatchedDeleteResult {
  readonly deleted: number;
  /** False when the deadline stopped the run before every matching row was gone. */
  readonly finished: boolean;
}

export function retentionCutoff(retentionDays: number, now: Date): Date {
  return daysBefore(now, retentionDays);
}

/**
 * Deletes the rows matching `where` a batch at a time, so a large backlog never
 * becomes one long statement, until none remain or the deadline passes.
 */
export async function deleteInBatches(
  database: AnyPgDb,
  table: PgTable,
  where: SQL | undefined,
  deadline = Number.POSITIVE_INFINITY,
  batchSize = DELETE_BATCH_SIZE,
): Promise<BatchedDeleteResult> {
  const matching = where ?? sql`true`;
  let deleted = 0;
  for (;;) {
    const rows = await database
      .delete(table)
      .where(sql`ctid IN (SELECT ctid FROM ${table} WHERE ${matching} LIMIT ${batchSize})`)
      .returning({ one: sql<number>`1` });
    deleted += rows.length;
    if (rows.length < batchSize) return { deleted, finished: true };
    if (Date.now() >= deadline) return { deleted, finished: false };
  }
}
