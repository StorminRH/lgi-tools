import { describe, expect, it } from 'vitest';
import { ownedSyncDocuments, purgeConvexFixtures, removeOwnedSyncRows } from './fixture-data-convex.cjs';

describe('fixture cleanup control flow', () => {
  it('continues purging other owned resources after one deletion fails', async () => {
    const attempted: string[] = [];
    async function run(name: string, args: { mapId?: string; userId?: string }) {
      const resource = `${name}:${args.mapId ?? args.userId}`;
      attempted.push(resource);
      if (args.mapId === 'broken-map') throw new Error('injected deletion failure');
      return { deleted: 0, hasMore: false };
    }
    await expect(purgeConvexFixtures({
      mapIds: ['broken-map', 'other-map'], userIds: ['owner', 'editor'],
    }, run)).rejects.toThrow('owned-resource purges failed');
    expect(attempted).toContain('mapPurge:purgeMapBatch:other-map');
    expect(attempted).toContain('characterLocationPurge:purgeForUser:owner');
    expect(attempted).toContain('mapAccessProjection:purgeUserClaims:editor');
  });

  it('drains bounded batches until the backend reports exhaustion', async () => {
    let calls = 0;
    await purgeConvexFixtures({ mapIds: ['owned'], userIds: [] }, async () => {
      calls += 1;
      return { deleted: calls < 3 ? 128 : 1, hasMore: calls < 3 };
    });
    expect(calls).toBe(3);
  });

  it('fails when purge results cannot establish completion', async () => {
    await expect(purgeConvexFixtures({ mapIds: ['owned'], userIds: [] }, async () => ({})))
      .rejects.toThrow('owned-resource purges failed');
    let calls = 0;
    await expect(purgeConvexFixtures({ mapIds: ['owned'], userIds: [] }, async () => {
      calls += 1;
      return { hasMore: true };
    })).rejects.toThrow('owned-resource purges failed');
    expect(calls).toBe(100);
  });
});


describe('source-verified scoped sync cleanup', () => {
  const ownedRow = { id: 'owned-subject', table: 'syncSubjects', ownerField: 'userId', ownerId: 'owner' };
  it('excludes foreign users and unrelated tables from document deletion', () => {
    const rows = [
      ownedRow,
      { ...ownedRow, id: 'foreign-subject', ownerId: 'someone-else' },
      { ...ownedRow, id: 'owned-map', table: 'mapSystems' },
      { ...ownedRow, id: 'wrong-field', ownerField: 'mapId' },
    ];
    expect(ownedSyncDocuments({ rows, userIds: ['owner'] })).toEqual([
      { id: 'owned-subject', tableName: 'syncSubjects' },
    ]);
  });

  it('refuses an invalid purge response instead of claiming deletion', async () => {
    await expect(removeOwnedSyncRows({ rows: [ownedRow], userIds: ['owner'] }, async () => ({
      success: false, error: 'injected rejection',
    }))).rejects.toThrow('owned sync-row purge failed');
  });

  it('continues other fixture users after one owned-sync purge fails', async () => {
    const attempted = [];
    await expect(removeOwnedSyncRows({ rows: [ownedRow], userIds: ['owner', 'editor'] }, async (name, args) => {
      attempted.push(`${name}:${args.userId}`);
      if (args.userId === 'owner') throw new Error('injected purge failure');
      return { deletedSubjects: 0, deletedPresence: 0 };
    })).rejects.toThrow('owned sync-row purge failed');
    expect(attempted).toEqual([
      'mapFixtureTracking:purgeOwnedSyncRows:owner',
      'mapFixtureTracking:purgeOwnedSyncRows:editor',
    ]);
  });

  it('purges leftover sync rows through the deployed fixture mutation', async () => {
    const attempted = [];
    await removeOwnedSyncRows({ rows: [ownedRow], userIds: ['owner', 'editor'] }, async (name, args) => {
      attempted.push(`${name}:${args.userId}`);
      return { deletedSubjects: 1, deletedPresence: 0 };
    });
    expect(attempted).toEqual([
      'mapFixtureTracking:purgeOwnedSyncRows:owner',
      'mapFixtureTracking:purgeOwnedSyncRows:editor',
    ]);
  });

  it('rejects malformed and oversized censuses before invoking deletion', async () => {
    await expect(removeOwnedSyncRows({ rows: [{ id: 'unknown' }], userIds: ['owner'] }))
      .rejects.toThrow('invalid owned-row census');
    expect(() => ownedSyncDocuments({ rows: Array.from({ length: 4097 }, () => ownedRow), userIds: ['owner'] }))
      .toThrow('exceeds the verified Convex limit');
  });
});
