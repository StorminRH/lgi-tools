import { describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import {
  promoteSnapshot,
  pruneWhStaticsSnapshots,
  readSystemStatics,
  recordSnapshot,
  rejectSnapshot,
  WhStaticsSnapshotStateError,
} from './queries';
import { whStaticsSnapshots, whSystemStatics } from './schema';

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => cacheMocks);

const harness = await createDbTestHarness({
  schema: 'test_wh_statics_queries',
  tables: ['wh_statics_snapshots', 'wh_system_statics'],
  foreignKeys: [
    {
      table: 'wh_system_statics',
      column: 'source_snapshot_id',
      refTable: 'wh_statics_snapshots',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  resetBetweenTests: 'truncate',
});

const EMPTY_DIFF = {
  systemsAdded: [],
  systemsRemoved: [],
  systemsChanged: [],
  codesAdded: [],
  codesRemoved: [],
  totalDifferences: 0,
} as const;

const AGREEMENT = {
  agreedSystems: 2,
  disagreements: [],
  lineageOnlySystems: [],
  feedOnlySystems: [],
} as const;

async function insertSnapshot(
  overrides: Partial<typeof whStaticsSnapshots.$inferInsert> = {},
): Promise<number> {
  const [snapshot] = await harness.db
    .insert(whStaticsSnapshots)
    .values({
      feedVersion: '11',
      digest: 'digest',
      systemCount: 1,
      entries: [
        { systemId: 31_000_001, systemName: 'J000001', code: 'A001' },
      ],
      difference: EMPTY_DIFF,
      crossCheck: AGREEMENT,
      ...overrides,
    })
    .returning({ id: whStaticsSnapshots.id });
  if (snapshot === undefined) throw new Error('Snapshot seed returned no id.');
  return snapshot.id;
}

describe.skipIf(!harness.reachable)(
  'wormhole statics snapshot writes (real Postgres)',
  () => {
    it('returns an empty serving projection before the first promotion', async () => {
      await expect(readSystemStatics(harness.db)).resolves.toEqual({
        version: '',
        systems: [],
      });
    });

    it('keeps exactly one pending snapshot and leaves the promoted copy untouched', async () => {
      const first = await recordSnapshot(harness.db, {
        feedVersion: '10',
        etag: '"old"',
        lastModified: null,
        entries: [
          { systemId: 2, systemName: 'J000002', code: 'B002' },
        ],
        difference: EMPTY_DIFF,
        crossCheck: AGREEMENT,
      });
      const second = await recordSnapshot(harness.db, {
        feedVersion: '11',
        etag: '"new"',
        lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
        entries: [
          { systemId: 2, systemName: 'J000002', code: 'B002' },
          { systemId: 1, systemName: 'J000001', code: 'A001' },
        ],
        difference: EMPTY_DIFF,
        crossCheck: AGREEMENT,
      });

      expect(second.snapshotId).toBeGreaterThan(first.snapshotId);
      const snapshots = await harness.db
        .select()
        .from(whStaticsSnapshots)
        .orderBy(asc(whStaticsSnapshots.id));
      expect(snapshots).toEqual([
        expect.objectContaining({
          id: first.snapshotId,
          feedVersion: '10',
          status: 'superseded',
        }),
        expect.objectContaining({
          id: second.snapshotId,
          feedVersion: '11',
          etag: '"new"',
          systemCount: 2,
          status: 'pending',
          entries: [
            { systemId: 1, systemName: 'J000001', code: 'A001' },
            { systemId: 2, systemName: 'J000002', code: 'B002' },
          ],
          digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]);
      expect(await harness.db.select().from(whSystemStatics)).toEqual([]);
    });

    it('promotes once, replaces the serving copy, and refuses a second promote', async () => {
      const snapshotId = await insertSnapshot({
        systemCount: 2,
        entries: [
          { systemId: 31_000_002, systemName: 'J000002', code: 'B002' },
          { systemId: 31_000_001, systemName: 'J000001', code: 'A001' },
        ],
      });

      await expect(promoteSnapshot(harness.db, snapshotId)).resolves.toEqual({
        snapshotId,
        systemCount: 2,
        assignmentCount: 2,
      });
      expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('wh-statics', 'max');
      expect(
        await harness.db
          .select()
          .from(whSystemStatics)
          .orderBy(asc(whSystemStatics.systemId)),
      ).toEqual([
        {
          systemId: 31_000_001,
          code: 'A001',
          feedVersion: '11',
          sourceSnapshotId: snapshotId,
        },
        {
          systemId: 31_000_002,
          code: 'B002',
          feedVersion: '11',
          sourceSnapshotId: snapshotId,
        },
      ]);
      await expect(readSystemStatics(harness.db)).resolves.toEqual({
        version: '11',
        systems: [
          { systemId: 31_000_001, codes: ['A001'] },
          { systemId: 31_000_002, codes: ['B002'] },
        ],
      });

      await expect(promoteSnapshot(harness.db, snapshotId)).rejects.toEqual(
        expect.objectContaining<Partial<WhStaticsSnapshotStateError>>({
          snapshotId,
          status: 'promoted',
        }),
      );
      expect(await harness.db.select().from(whSystemStatics)).toHaveLength(2);
    });

    it('rejects only a pending snapshot and leaves the serving copy untouched', async () => {
      const snapshotId = await insertSnapshot();

      await expect(rejectSnapshot(harness.db, snapshotId)).resolves.toBeUndefined();
      const [snapshot] = await harness.db
        .select({ status: whStaticsSnapshots.status })
        .from(whStaticsSnapshots)
        .where(eq(whStaticsSnapshots.id, snapshotId));
      expect(snapshot?.status).toBe('rejected');
      await expect(rejectSnapshot(harness.db, snapshotId)).rejects.toBeInstanceOf(
        WhStaticsSnapshotStateError,
      );
      expect(await harness.db.select().from(whSystemStatics)).toEqual([]);
    });

    it('prunes old history while preserving pending, current promoted, and recent rows', async () => {
      const now = new Date('2026-07-28T12:00:00Z');
      const old = new Date('2026-01-01T00:00:00Z');
      const recent = new Date('2026-07-01T00:00:00Z');
      const currentPromoted = await insertSnapshot({
        status: 'promoted',
        createdAt: old,
      });
      const stalePromoted = await insertSnapshot({
        status: 'promoted',
        createdAt: old,
      });
      const staleRejected = await insertSnapshot({
        status: 'rejected',
        createdAt: old,
      });
      const staleSuperseded = await insertSnapshot({
        status: 'superseded',
        createdAt: old,
      });
      const pending = await insertSnapshot({ status: 'pending', createdAt: old });
      const recentRejected = await insertSnapshot({
        status: 'rejected',
        createdAt: recent,
      });
      await harness.db.insert(whSystemStatics).values({
        systemId: 31_000_001,
        code: 'A001',
        feedVersion: '11',
        sourceSnapshotId: currentPromoted,
      });

      await expect(
        pruneWhStaticsSnapshots(harness.db, 90, now),
      ).resolves.toBe(3);
      const remaining = await harness.db
        .select({ id: whStaticsSnapshots.id })
        .from(whStaticsSnapshots)
        .orderBy(asc(whStaticsSnapshots.id));
      expect(remaining.map((row) => row.id)).toEqual([
        currentPromoted,
        pending,
        recentRejected,
      ]);
      expect(remaining.map((row) => row.id)).not.toContain(stalePromoted);
      expect(remaining.map((row) => row.id)).not.toContain(staleRejected);
      expect(remaining.map((row) => row.id)).not.toContain(staleSuperseded);
    });
  },
);
