import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import type { PostgresJsDb } from '@/lib/db-types';
import { WH_STATICS_TAG } from './constants';
import { diffStatics } from './diff';
import {
  digestStaticsEntries,
  listPromotedStatics,
  promoteSnapshot,
  pruneWhStaticsSnapshots,
  recordSnapshot,
  rejectSnapshot,
  SnapshotNotPendingError,
} from './queries';
import { whStaticsSnapshots, whSystemStatics } from './schema';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

const { revalidateTag } = await import('next/cache');

const SCHEMA = 'test_wh_statics_queries';
const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: ['wh_statics_snapshots', 'wh_system_statics'],
  resetBetweenTests: 'truncate',
});

const EMPTY_DIFF = diffStatics([], []);
const EMPTY_CROSS = {
  agreedSystems: 0,
  disagreements: [],
  lineageOnlySystems: [],
  feedOnlySystems: [],
};

async function pendingSnapshot(
  db: PostgresJsDb,
  entries = [{ systemId: 31002318, systemName: 'J111613', code: 'E175' }],
) {
  return recordSnapshot(db, {
    feedVersion: '11',
    etag: '"etag-1"',
    lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    entries,
    diff: EMPTY_DIFF,
    crossCheck: EMPTY_CROSS,
  });
}

describe.skipIf(!harness.reachable)('wh-statics queries (real Postgres)', () => {
  it('writes one pending snapshot and leaves wh_system_statics unchanged', async () => {
    const db = harness.db as unknown as PostgresJsDb;
    const entries = [
      { systemId: 31002318, systemName: 'J111613', code: 'E175' },
    ];

    const { snapshotId } = await recordSnapshot(db, {
      feedVersion: '11',
      etag: '"etag-1"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
      entries,
      diff: EMPTY_DIFF,
      crossCheck: EMPTY_CROSS,
    });

    const snapshots = await harness.db.select().from(whStaticsSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      id: snapshotId,
      feedVersion: '11',
      etag: '"etag-1"',
      digest: digestStaticsEntries(entries),
      status: 'pending',
      systemCount: 1,
    });
    expect(await listPromotedStatics(db)).toEqual([]);
    expect(await harness.db.select().from(whSystemStatics)).toEqual([]);
  });

  it('supersedes any prior pending row so exactly one snapshot is pending', async () => {
    const db = harness.db as unknown as PostgresJsDb;
    const first = await pendingSnapshot(db, [
      { systemId: 1, systemName: 'A', code: 'E175' },
    ]);
    const second = await pendingSnapshot(db, [
      { systemId: 2, systemName: 'B', code: 'C247' },
    ]);

    const rows = await harness.db.select().from(whStaticsSnapshots);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.snapshotId)?.status).toBe('superseded');
    expect(rows.find((row) => row.id === second.snapshotId)?.status).toBe('pending');
    expect(rows.filter((row) => row.status === 'pending')).toHaveLength(1);
  });

  it('promotes a pending snapshot into the serving copy and refuses a second promote', async () => {
    const db = harness.db as unknown as PostgresJsDb;
    vi.mocked(revalidateTag).mockClear();
    const { snapshotId } = await pendingSnapshot(db);

    await expect(promoteSnapshot(db, snapshotId)).resolves.toEqual({
      snapshotId,
      feedVersion: '11',
      systemCount: 1,
      rowCount: 1,
    });
    expect(revalidateTag).toHaveBeenCalledWith(WH_STATICS_TAG, 'max');
    expect(await listPromotedStatics(db)).toEqual([
      { systemId: 31002318, code: 'E175' },
    ]);
    await expect(promoteSnapshot(db, snapshotId)).rejects.toBeInstanceOf(
      SnapshotNotPendingError,
    );
  });

  it('rejects a pending snapshot without touching the promoted copy', async () => {
    const db = harness.db as unknown as PostgresJsDb;
    const promoted = await pendingSnapshot(db, [
      { systemId: 1, systemName: 'A', code: 'E175' },
    ]);
    await promoteSnapshot(db, promoted.snapshotId);
    const pending = await pendingSnapshot(db, [
      { systemId: 2, systemName: 'B', code: 'C247' },
    ]);

    await rejectSnapshot(db, pending.snapshotId);
    const [rejected] = await harness.db
      .select()
      .from(whStaticsSnapshots)
      .where(eq(whStaticsSnapshots.id, pending.snapshotId));
    expect(rejected?.status).toBe('rejected');
    expect(await listPromotedStatics(db)).toEqual([{ systemId: 1, code: 'E175' }]);
  });

  it('prunes aged non-pending rows while preserving pending and currently promoted', async () => {
    const db = harness.db as unknown as PostgresJsDb;
    const old = new Date('2020-01-01T00:00:00.000Z');
    const { snapshotId: promotedId } = await pendingSnapshot(db, [
      { systemId: 1, systemName: 'A', code: 'E175' },
    ]);
    await promoteSnapshot(db, promotedId);

    const { snapshotId: pendingId } = await pendingSnapshot(db, [
      { systemId: 2, systemName: 'B', code: 'C247' },
    ]);
    // Age a superseded row by recording a second pending after the first.
    const { snapshotId: newestPendingId } = await pendingSnapshot(db, [
      { systemId: 3, systemName: 'C', code: 'N766' },
    ]);
    expect(newestPendingId).not.toBe(pendingId);

    await harness.db.insert(whStaticsSnapshots).values({
      feedVersion: '11',
      etag: '"old-rejected"',
      digest: 'b'.repeat(64),
      systemCount: 0,
      status: 'rejected',
      entries: [],
      diff: EMPTY_DIFF,
      crossCheck: EMPTY_CROSS,
      createdAt: old,
    });
    await harness.db
      .update(whStaticsSnapshots)
      .set({ createdAt: old })
      .where(eq(whStaticsSnapshots.id, pendingId));

    const deleted = await pruneWhStaticsSnapshots(db, 30, new Date('2026-07-28T00:00:00.000Z'));
    expect(deleted).toBeGreaterThanOrEqual(2);

    const remaining = await harness.db.select().from(whStaticsSnapshots);
    expect(remaining.some((row) => row.id === promotedId && row.status === 'promoted')).toBe(
      true,
    );
    expect(remaining.some((row) => row.id === newestPendingId && row.status === 'pending')).toBe(
      true,
    );
    expect(remaining.some((row) => row.id === pendingId)).toBe(false);
    expect(await listPromotedStatics(db)).toEqual([{ systemId: 1, code: 'E175' }]);
  });
});
