import { createHash } from 'node:crypto';
import { and, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { WH_STATICS_TAG } from './constants';
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

/** Result of a successful operator promote. */
export type PromoteResult = {
  snapshotId: number;
  feedVersion: string;
  systemCount: number;
  rowCount: number;
};

/**
 * Thrown when promote or reject targets a snapshot that is not currently
 * `pending` (already promoted, rejected, or superseded).
 */
export class SnapshotNotPendingError extends Error {
  readonly snapshotId: number;
  readonly status: string | null;

  constructor(snapshotId: number, status: string | null) {
    super(
      status === null
        ? `Snapshot ${snapshotId} does not exist`
        : `Snapshot ${snapshotId} is ${status}, not pending`,
    );
    this.name = 'SnapshotNotPendingError';
    this.snapshotId = snapshotId;
    this.status = status;
  }
}

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
        entries: [...input.entries],
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

/**
 * Replaces `wh_system_statics` from a pending snapshot's entries and marks that
 * snapshot `promoted` in one postgres-js transaction, then invalidates the
 * serving cache tag. Refuses a snapshot that is not `pending`.
 */
export async function promoteSnapshot(
  database: PostgresJsDb,
  snapshotId: number,
): Promise<PromoteResult> {
  const result = await database.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(whStaticsSnapshots)
      .where(eq(whStaticsSnapshots.id, snapshotId))
      .limit(1);

    if (snapshot === undefined || snapshot.status !== 'pending') {
      throw new SnapshotNotPendingError(snapshotId, snapshot?.status ?? null);
    }

    const entries = snapshot.entries;
    await tx.delete(whSystemStatics);
    if (entries.length > 0) {
      await tx.insert(whSystemStatics).values(
        entries.map((entry) => ({
          systemId: entry.systemId,
          code: entry.code,
          version: snapshot.feedVersion,
          snapshotId: snapshot.id,
        })),
      );
    }

    await tx
      .update(whStaticsSnapshots)
      .set({ status: 'promoted' })
      .where(eq(whStaticsSnapshots.id, snapshotId));

    return {
      snapshotId: snapshot.id,
      feedVersion: snapshot.feedVersion,
      systemCount: snapshot.systemCount,
      rowCount: entries.length,
    };
  });

  revalidateTag(WH_STATICS_TAG, 'max');
  return result;
}

/**
 * Marks a pending snapshot `rejected`. Refuses a snapshot that is not
 * `pending`. Does not touch the promoted serving copy.
 */
export async function rejectSnapshot(
  database: PostgresJsDb,
  snapshotId: number,
): Promise<void> {
  const updated = await database
    .update(whStaticsSnapshots)
    .set({ status: 'rejected' })
    .where(
      and(
        eq(whStaticsSnapshots.id, snapshotId),
        eq(whStaticsSnapshots.status, 'pending'),
      ),
    )
    .returning({ id: whStaticsSnapshots.id });

  if (updated.length === 0) {
    const [existing] = await database
      .select({ status: whStaticsSnapshots.status })
      .from(whStaticsSnapshots)
      .where(eq(whStaticsSnapshots.id, snapshotId))
      .limit(1);
    throw new SnapshotNotPendingError(snapshotId, existing?.status ?? null);
  }
}

/**
 * Deletes aged `promoted`, `rejected`, and `superseded` snapshot rows older
 * than the retention window while always preserving any `pending` row and the
 * snapshot id(s) currently referenced by `wh_system_statics`. Returns the
 * number of deleted rows.
 */
export async function pruneWhStaticsSnapshots(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const referenced = await database
    .selectDistinct({ snapshotId: whSystemStatics.snapshotId })
    .from(whSystemStatics);
  const keepIds = referenced.map((row) => row.snapshotId);

  const deleted = await database
    .delete(whStaticsSnapshots)
    .where(
      and(
        inArray(whStaticsSnapshots.status, ['promoted', 'rejected', 'superseded']),
        lt(whStaticsSnapshots.createdAt, cutoff),
        keepIds.length > 0
          ? notInArray(whStaticsSnapshots.id, keepIds)
          : sql`true`,
      ),
    )
    .returning({ id: whStaticsSnapshots.id });

  return deleted.length;
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
