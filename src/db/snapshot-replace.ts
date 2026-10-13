import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';
import { chunk } from '@/lib/array';
import type { AnyPgDb } from '@/lib/db-types';
import { directDatabase } from './direct-database';
import { isUniqueViolation } from './pg-errors';

/** Rows per INSERT. The widest owner table binds 10 parameters a row, far below the 65,534 cap. */
const SNAPSHOT_INSERT_BATCH = 1000;

/**
 * Replace one owner's snapshot in a single direct-client transaction. `lock`
 * runs first and upserts the owner's sync (or profile) row; that row lock
 * queues every later refresh of the owner, its first publication included,
 * behind this one instead of letting the two interleave. `replace` then
 * deletes and re-inserts the owner's rows, in one or more tables. Any failure
 * rolls both back, so the prior rows and etags survive together. A unique
 * violation resolves to 'superseded'; every other error rejects. The caller
 * revalidates after the commit, and only on 'saved'. Given a transaction
 * (an owner sync's commit), the steps run in a savepoint on it, and the
 * caller's commit decides what stands.
 */
export async function replaceOwnerSnapshot(
  steps: {
    readonly lock: (tx: AnyPgDb) => Promise<unknown>;
    readonly replace: (tx: AnyPgDb) => Promise<unknown>;
  },
  database: AnyPgDb = directDatabase(),
): Promise<'saved' | 'superseded'> {
  try {
    await database.transaction(async (tx) => {
      await steps.lock(tx);
      await steps.replace(tx);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return 'superseded';
  }
  return 'saved';
}

/** Insert an owner's fresh rows on the caller's transaction, in statements that stay under the bind-parameter cap. */
export async function insertInBatches<TTable extends PgTable>(
  tx: AnyPgDb,
  table: TTable,
  rows: readonly PgInsertValue<TTable>[],
): Promise<void> {
  for (const batch of chunk(rows, SNAPSHOT_INSERT_BATCH)) await tx.insert(table).values(batch);
}
