import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDb } from '@/lib/db-types';
import type { StaticsCrossCheck } from './cross-check';
import type { StaticsDiff } from './diff';
import type { StaticsEntry } from './parse';
import { whStaticsSnapshots, whSystemStatics } from './schema';

/** Input required to park one validated feed snapshot as `pending`. */
export type RecordSnapshotInput = {
  feedVersion: string;
  etag: string;
  lastModified: string | null;
  entries: readonly StaticsEntry[];
  diff: StaticsDiff;
  crossCheck: StaticsCrossCheck;
};

/**
 * SHA-256 of the normalized entries in system-id-then-code order. Stable across
 * equivalent payloads so ETag churn on an unchanged re-upload can still produce
 * a zero-difference pending snapshot.
 */
export function digestStaticsEntries(entries: readonly StaticsEntry[]): string {
  const canonical = entries
    .map((entry) => `${entry.systemId}\t${entry.code}\t${entry.systemName}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Marks every existing `pending` snapshot `superseded` and inserts one new
 * `pending` snapshot in a single postgres-js transaction. Returns its
 * `bigserial` id. Leaves `wh_system_statics` untouched.
 */
export async function recordSnapshot(
  database: PostgresJsDb,
  input: RecordSnapshotInput,
): Promise<{ snapshotId: number }> {
  const digest = digestStaticsEntries(input.entries);
  const systemIds = new Set(input.entries.map((entry) => entry.systemId));

  return database.transaction(async (tx) => {
    await tx
      .update(whStaticsSnapshots)
      .set({ status: 'superseded' })
      .where(eq(whStaticsSnapshots.status, 'pending'));

    const [row] = await tx
      .insert(whStaticsSnapshots)
      .values({
        feedVersion: input.feedVersion,
        etag: input.etag,
        lastModified: input.lastModified,
        digest,
        systemCount: systemIds.size,
        status: 'pending',
        entries: input.entries,
        diff: input.diff,
        crossCheck: input.crossCheck,
      })
      .returning({ id: whStaticsSnapshots.id });

    if (row === undefined) {
      throw new Error('recordSnapshot insert returned no row');
    }
    return { snapshotId: row.id };
  });
}

/** Reads the promoted serving copy as `{ systemId, code }` pairs for diffing. */
export async function listPromotedStatics(
  database: PostgresJsDb,
): Promise<{ systemId: number; code: string }[]> {
  return database
    .select({
      systemId: whSystemStatics.systemId,
      code: whSystemStatics.code,
    })
    .from(whSystemStatics)
    .orderBy(whSystemStatics.systemId, whSystemStatics.code);
}
