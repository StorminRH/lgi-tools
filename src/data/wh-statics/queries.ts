import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PostgresJsDb } from '@/lib/db-types';
import {
  whStaticsSnapshots,
  type WhStaticEntry,
  type WhStaticsCrossCheck,
  type WhStaticsDiff,
} from './schema';

/** Complete validated material required to record one pending statics snapshot. */
export interface RecordWhStaticsSnapshotInput {
  readonly feedVersion: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly entries: readonly WhStaticEntry[];
  readonly difference: WhStaticsDiff;
  readonly crossCheck: WhStaticsCrossCheck;
}

function canonicalEntries(
  entries: readonly WhStaticEntry[],
): WhStaticEntry[] {
  return entries
    .map((entry) => ({ ...entry }))
    .sort(
      (left, right) =>
        left.systemId - right.systemId || left.code.localeCompare(right.code),
    );
}

function entriesDigest(entries: readonly WhStaticEntry[]): string {
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

/**
 * Supersedes every prior pending snapshot and inserts one canonical replacement
 * in the same postgres-js transaction.
 */
export function recordSnapshot(
  database: PostgresJsDb,
  input: RecordWhStaticsSnapshotInput,
): Promise<{ snapshotId: number }> {
  const entries = canonicalEntries(input.entries);
  return database.transaction(async (transaction) => {
    await transaction
      .update(whStaticsSnapshots)
      .set({ status: 'superseded' })
      .where(eq(whStaticsSnapshots.status, 'pending'));
    const [inserted] = await transaction
      .insert(whStaticsSnapshots)
      .values({
        feedVersion: input.feedVersion,
        etag: input.etag,
        lastModified: input.lastModified,
        digest: entriesDigest(entries),
        systemCount: new Set(entries.map((entry) => entry.systemId)).size,
        status: 'pending',
        entries,
        difference: input.difference,
        crossCheck: input.crossCheck,
      })
      .returning({ id: whStaticsSnapshots.id });
    if (inserted === undefined) {
      throw new Error('Statics snapshot insert returned no id.');
    }
    return { snapshotId: inserted.id };
  });
}
