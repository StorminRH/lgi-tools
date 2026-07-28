import { describe, expect, it } from 'vitest';
import { asc } from 'drizzle-orm';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { recordSnapshot } from './queries';
import { whStaticsSnapshots, whSystemStatics } from './schema';

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

describe.skipIf(!harness.reachable)(
  'wormhole statics snapshot writes (real Postgres)',
  () => {
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
  },
);
