import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import type { PostgresJsDb } from '@/lib/db-types';
import { diffStatics } from './diff';
import {
  digestStaticsEntries,
  listPromotedStatics,
  recordSnapshot,
} from './queries';
import { whStaticsSnapshots, whSystemStatics } from './schema';

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

describe.skipIf(!harness.reachable)('recordSnapshot (real Postgres)', () => {
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
    const first = await recordSnapshot(db, {
      feedVersion: '11',
      etag: '"a"',
      lastModified: null,
      entries: [{ systemId: 1, systemName: 'A', code: 'E175' }],
      diff: EMPTY_DIFF,
      crossCheck: EMPTY_CROSS,
    });
    const second = await recordSnapshot(db, {
      feedVersion: '11',
      etag: '"b"',
      lastModified: null,
      entries: [{ systemId: 2, systemName: 'B', code: 'C247' }],
      diff: EMPTY_DIFF,
      crossCheck: EMPTY_CROSS,
    });

    const rows = await harness.db.select().from(whStaticsSnapshots);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.snapshotId)?.status).toBe('superseded');
    expect(rows.find((row) => row.id === second.snapshotId)?.status).toBe('pending');
    expect(rows.filter((row) => row.status === 'pending')).toHaveLength(1);
  });
});
