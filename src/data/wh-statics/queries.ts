import { createHash } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { WH_STATICS_TAG } from './constants';
import {
  whStaticsSnapshots,
  whSystemStatics,
  type WhStaticEntry,
  type WhStaticsCrossCheck,
  type WhStaticsDiff,
  type WhStaticsSnapshotStatus,
} from './schema';

export interface WhStaticsProbeBaseline {
  readonly etag: string | null;
  readonly latestSnapshotId: number | null;
}

export interface RecordWhStaticsSnapshotInput {
  readonly feedVersion: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly baseline: WhStaticsProbeBaseline;
  readonly entries: readonly WhStaticEntry[];
  readonly difference: WhStaticsDiff;
  readonly crossCheck: WhStaticsCrossCheck;
}

export type RecordWhStaticsSnapshotResult =
  | { readonly recorded: 'created'; readonly snapshotId: number }
  | { readonly recorded: 'duplicate'; readonly snapshotId: number }
  | { readonly recorded: 'stale'; readonly snapshotId: number };

export interface PromoteWhStaticsResult {
  readonly snapshotId: number;
  readonly systemCount: number;
  readonly assignmentCount: number;
}

export interface PendingWhStaticsReview {
  readonly id: number;
  readonly feedVersion: string;
  readonly etag: string | null;
  readonly systemCount: number;
  readonly difference: WhStaticsDiff;
  readonly crossCheck: WhStaticsCrossCheck;
  readonly createdAt: Date;
}

export interface PromotedStatics {
  readonly version: string;
  readonly systems: readonly {
    readonly systemId: number;
    readonly codes: readonly string[];
  }[];
}

export class WhStaticsSnapshotStateError extends Error {

  constructor(
    readonly snapshotId: number,
    readonly status: WhStaticsSnapshotStatus | 'missing',
  ) {
    super(`Statics snapshot ${snapshotId} is ${status}, not pending`);
    this.name = 'WhStaticsSnapshotStateError';
  }
}

export class WhStaticsEmptySnapshotError extends Error {

  constructor(readonly snapshotId: number) {
    super(`Statics snapshot ${snapshotId} has no assignments to promote`);
    this.name = 'WhStaticsEmptySnapshotError';
  }
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

async function requirePendingSnapshot(
  database: AnyPgDb,
  snapshotId: number,
): Promise<{
  status: WhStaticsSnapshotStatus;
  feedVersion: string;
  systemCount: number;
  entries: readonly WhStaticEntry[];
}> {
  const [snapshot] = await database
    .select({
      status: whStaticsSnapshots.status,
      feedVersion: whStaticsSnapshots.feedVersion,
      systemCount: whStaticsSnapshots.systemCount,
      entries: whStaticsSnapshots.entries,
    })
    .from(whStaticsSnapshots)
    .where(eq(whStaticsSnapshots.id, snapshotId))
    .for('update');
  return pendingSnapshotOrThrow(snapshotId, snapshot);
}

function pendingSnapshotOrThrow<T extends { status: WhStaticsSnapshotStatus }>(
  snapshotId: number,
  snapshot: T | undefined,
): T {
  if (snapshot === undefined) {
    throw new WhStaticsSnapshotStateError(snapshotId, 'missing');
  }
  if (snapshot.status !== 'pending') {
    throw new WhStaticsSnapshotStateError(snapshotId, snapshot.status);
  }
  return snapshot;
}

interface LatestSnapshotRow {
  readonly id: number;
  readonly etag: string | null;
  readonly digest: string;
  readonly status: WhStaticsSnapshotStatus;
}

function isSameObservation(
  latest: LatestSnapshotRow,
  etag: string | null,
  digest: string,
): boolean {
  if (latest.status === 'rejected') return false;
  return latest.etag === etag && latest.digest === digest;
}

function settledByLatestSnapshot(
  latest: LatestSnapshotRow,
  input: RecordWhStaticsSnapshotInput,
  digest: string,
): RecordWhStaticsSnapshotResult | null {
  if (isSameObservation(latest, input.etag, digest)) {
    return { recorded: 'duplicate', snapshotId: latest.id };
  }

  const observed = input.baseline.latestSnapshotId ?? 0;
  if (latest.id > observed) {
    return { recorded: 'stale', snapshotId: latest.id };
  }
  return null;
}

function insertedSnapshotId(inserted: { id: number } | undefined): number {
  if (inserted === undefined) {
    throw new Error('Statics snapshot insert returned no id.');
  }
  return inserted.id;
}

export function recordSnapshot(
  database: PostgresJsDb,
  input: RecordWhStaticsSnapshotInput,
): Promise<RecordWhStaticsSnapshotResult> {
  const entries = canonicalEntries(input.entries);
  const digest = entriesDigest(entries);
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`lock table ${whStaticsSnapshots} in share row exclusive mode`,
    );
    const [latest] = await transaction
      .select({
        id: whStaticsSnapshots.id,
        etag: whStaticsSnapshots.etag,
        digest: whStaticsSnapshots.digest,
        status: whStaticsSnapshots.status,
      })
      .from(whStaticsSnapshots)
      .orderBy(desc(whStaticsSnapshots.id))
      .limit(1);
    if (latest !== undefined) {
      const settled = settledByLatestSnapshot(latest, input, digest);
      if (settled !== null) return settled;
    }
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
        digest,
        systemCount: new Set(entries.map((entry) => entry.systemId)).size,
        status: 'pending',
        entries,
        difference: input.difference,
        crossCheck: input.crossCheck,
      })
      .returning({ id: whStaticsSnapshots.id });
    return { recorded: 'created', snapshotId: insertedSnapshotId(inserted) };
  });
}

export async function getSnapshotProbeBaseline(
  database: AnyPgDb,
): Promise<WhStaticsProbeBaseline> {
  const [latestRows, conditionalRows] = await Promise.all([
    database
      .select({ id: whStaticsSnapshots.id })
      .from(whStaticsSnapshots)
      .orderBy(desc(whStaticsSnapshots.id))
      .limit(1),
    database
      .select({ etag: whStaticsSnapshots.etag })
      .from(whStaticsSnapshots)
      .where(ne(whStaticsSnapshots.status, 'rejected'))
      .orderBy(desc(whStaticsSnapshots.id))
      .limit(1),
  ]);
  const [latest] = latestRows;
  const [conditional] = conditionalRows;
  return {
    etag: conditional === undefined ? null : conditional.etag,
    latestSnapshotId: latest === undefined ? null : latest.id,
  };
}

export async function getPendingWhStaticsReview(
  database: AnyPgDb,
): Promise<PendingWhStaticsReview | null> {
  const [snapshot] = await database
    .select({
      id: whStaticsSnapshots.id,
      feedVersion: whStaticsSnapshots.feedVersion,
      etag: whStaticsSnapshots.etag,
      systemCount: whStaticsSnapshots.systemCount,
      difference: whStaticsSnapshots.difference,
      crossCheck: whStaticsSnapshots.crossCheck,
      createdAt: whStaticsSnapshots.createdAt,
    })
    .from(whStaticsSnapshots)
    .where(eq(whStaticsSnapshots.status, 'pending'))
    .limit(1);
  return snapshot ?? null;
}

export function readPromotedWhStaticsAssignments(
  database: AnyPgDb,
): Promise<Array<{ systemId: number; code: string }>> {
  return database
    .select({
      systemId: whSystemStatics.systemId,
      code: whSystemStatics.code,
    })
    .from(whSystemStatics);
}

export async function readSystemStaticsForSystem(
  database: AnyPgDb,
  systemId: number,
): Promise<string[]> {
  const rows = await database
    .select({ code: whSystemStatics.code })
    .from(whSystemStatics)
    .where(eq(whSystemStatics.systemId, systemId))
    .orderBy(asc(whSystemStatics.code));
  return rows.map((row) => row.code);
}

export async function readSystemStatics(
  database: AnyPgDb,
): Promise<PromotedStatics> {
  const rows = await database
    .select({
      systemId: whSystemStatics.systemId,
      code: whSystemStatics.code,
      feedVersion: whSystemStatics.feedVersion,
    })
    .from(whSystemStatics)
    .orderBy(asc(whSystemStatics.systemId), asc(whSystemStatics.code));
  const systems: Array<{ systemId: number; codes: string[] }> = [];
  for (const row of rows) {
    const current = systems.at(-1);
    if (current?.systemId === row.systemId) {
      current.codes.push(row.code);
    } else {
      systems.push({ systemId: row.systemId, codes: [row.code] });
    }
  }
  return { version: rows[0]?.feedVersion ?? '', systems };
}

export async function getSystemStatics(): Promise<PromotedStatics> {
  'use cache';
  cacheLife('max');
  cacheTag(WH_STATICS_TAG);
  return withColdStartRetry(() => readSystemStatics(db));
}

export async function promoteSnapshot(
  database: PostgresJsDb,
  snapshotId: number,
): Promise<PromoteWhStaticsResult> {
  const result = await database.transaction(async (transaction) => {
    const snapshot = await requirePendingSnapshot(transaction, snapshotId);
    if (snapshot.entries.length === 0) {
      throw new WhStaticsEmptySnapshotError(snapshotId);
    }

    await transaction.delete(whSystemStatics);
    await transaction.insert(whSystemStatics).values(
      snapshot.entries.map((entry) => ({
        systemId: entry.systemId,
        code: entry.code,
        feedVersion: snapshot.feedVersion,
        sourceSnapshotId: snapshotId,
      })),
    );
    await transaction
      .update(whStaticsSnapshots)
      .set({ status: 'promoted' })
      .where(eq(whStaticsSnapshots.id, snapshotId));
    return {
      snapshotId,
      systemCount: snapshot.systemCount,
      assignmentCount: snapshot.entries.length,
    };
  });
  revalidateTag(WH_STATICS_TAG, 'max');
  return result;
}

export function rejectSnapshot(
  database: PostgresJsDb,
  snapshotId: number,
): Promise<void> {
  return database.transaction(async (transaction) => {
    await requirePendingSnapshot(transaction, snapshotId);
    await transaction
      .update(whStaticsSnapshots)
      .set({ status: 'rejected' })
      .where(eq(whStaticsSnapshots.id, snapshotId));
  });
}

export async function pruneWhStaticsSnapshots(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  );
  const deleted = await database
    .delete(whStaticsSnapshots)
    .where(
      and(
        inArray(whStaticsSnapshots.status, [
          'promoted',
          'rejected',
          'superseded',
        ]),
        lt(whStaticsSnapshots.createdAt, cutoff),
        notInArray(
          whStaticsSnapshots.id,
          database
            .selectDistinct({ id: whSystemStatics.sourceSnapshotId })
            .from(whSystemStatics),
        ),
      ),
    )
    .returning({ id: whStaticsSnapshots.id });
  return deleted.length;
}
