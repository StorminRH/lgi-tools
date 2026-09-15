import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { mapAccess, maps } from '@/data/maps/schema';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import type { AffiliationFetchResult } from '@/platform/auth/affiliation-source';
import { getUserAffiliations, readPendingMapAccessChanges } from '@/platform/auth/affiliation-store';
import { computeMapAccessClaims } from './map-access-projection';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/platform/auth/affiliation-source', () => ({ fetchAffiliations: mocks.fetch }));

const harness = await createDbTestHarness({
  schema: 'test_affiliation_refresh_order',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const CHARACTER_ID = 90000042;
const OLD_CORPORATION = 98000042;
const NEW_CORPORATION = 98000043;
const MAP_ID = '12345678-0000-4000-8000-123456789000';
const STARTED_AT = new Date('2026-09-15T12:00:00.000Z');
const NEWER_STARTED_AT = new Date(STARTED_AT.getTime() + 1_000);

function response(corporationId: number): AffiliationFetchResult {
  return {
    rows: [{ characterId: CHARACTER_ID, corporationId, allianceId: null, factionId: null }],
    transientFailure: false,
  };
}

describe.skipIf(!harness.reachable)('affiliation refresh ordering (real Postgres)', () => {
  beforeEach(async () => {
    mocks.fetch.mockReset();
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'member');
    await seedCharacter(harness.db, CHARACTER_ID, {
      corporationId: OLD_CORPORATION,
      affiliationRefreshedAt: new Date(0),
    });
    await seedEveAccount(harness.db, { id: 'member-character', characterId: CHARACTER_ID, userId: 'member' });
    await harness.db.insert(maps).values({ id: MAP_ID, userId: 'creator', name: 'Refresh ordering' });
    await harness.db.insert(mapAccess).values({
      mapId: MAP_ID, ownerType: 'corporation', ownerId: OLD_CORPORATION, role: 'viewer',
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(STARTED_AT);
  });

  afterEach(() => vi.useRealTimers());

  it.each(['older first', 'newer first'] as const)(
    'keeps the newer observation and revoked map access when responses finish %s',
    async (order) => {
      const older = Promise.withResolvers<AffiliationFetchResult>();
      const newer = Promise.withResolvers<AffiliationFetchResult>();
      mocks.fetch.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      const olderRefresh = refreshAffiliationsWithOutcome([CHARACTER_ID]);
      vi.setSystemTime(NEWER_STARTED_AT);
      const newerRefresh = refreshAffiliationsWithOutcome([CHARACTER_ID]);

      if (order === 'older first') {
        older.resolve(response(OLD_CORPORATION));
        expect((await olderRefresh).refreshed).toBe(1);
      }
      newer.resolve(response(NEW_CORPORATION));
      await expect(newerRefresh).resolves.toEqual({
        refreshed: 1, accessChanged: true, transientFailure: false,
      });
      const pending = await readPendingMapAccessChanges();
      expect(pending).toEqual([{ mapId: MAP_ID, version: expect.any(String) }]);

      if (order === 'newer first') {
        vi.setSystemTime(new Date(NEWER_STARTED_AT.getTime() + 5_000));
        older.resolve(response(OLD_CORPORATION));
        await expect(olderRefresh).resolves.toEqual({
          refreshed: 0, accessChanged: false, transientFailure: false,
        });
      }
      expect(await getUserAffiliations('member')).toEqual([{
        characterId: CHARACTER_ID,
        corporationId: NEW_CORPORATION,
        allianceId: null,
        factionId: null,
        refreshedAt: NEWER_STARTED_AT,
      }]);
      await expect(computeMapAccessClaims(MAP_ID)).resolves.toEqual([
        { userId: 'creator', roles: ['admin'] },
      ]);
      await expect(readPendingMapAccessChanges()).resolves.toEqual(pending);
    },
  );

  it('rejects conflicting observations with the same timestamp without rotating pending work', async () => {
    mocks.fetch.mockResolvedValueOnce(response(NEW_CORPORATION))
      .mockResolvedValueOnce(response(OLD_CORPORATION));
    expect((await refreshAffiliationsWithOutcome([CHARACTER_ID])).refreshed).toBe(1);
    const pending = await readPendingMapAccessChanges();

    await expect(refreshAffiliationsWithOutcome([CHARACTER_ID])).resolves.toEqual({
      refreshed: 0, accessChanged: false, transientFailure: false,
    });
    expect((await getUserAffiliations('member'))[0]).toMatchObject({
      corporationId: NEW_CORPORATION, refreshedAt: STARTED_AT,
    });
    await expect(computeMapAccessClaims(MAP_ID)).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
    await expect(readPendingMapAccessChanges()).resolves.toEqual(pending);
  });
});
