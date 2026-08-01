import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/test-support/db-test-harness';
import { mapAccess, maps } from '@/data/maps/schema';
import { computeMapAccessClaims } from './map-access-projection';

const mocks = vi.hoisted(() => ({
  refreshAffiliationsWithOutcome: vi.fn().mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  }),
  refreshStaleAffiliationsForUserWithOutcome: vi.fn().mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  }),
}));

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
  refreshStaleAffiliationsForUserWithOutcome: mocks.refreshStaleAffiliationsForUserWithOutcome,
}));

const harness = await createDbTestHarness({
  schema: 'test_map_access_projection',
  tables: ['user', 'account', 'characters', 'maps', 'map_access'],
  foreignKeys: [
    {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'maps',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_access',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

beforeEach(() => {
  mocks.refreshAffiliationsWithOutcome.mockReset();
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  });
  mocks.refreshStaleAffiliationsForUserWithOutcome.mockReset();
  mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  });
});

describe.skipIf(!harness.reachable)('computeMapAccessClaims (real Postgres)', () => {
  it('projects creator, character-grant, and corp-grant principals deterministically', async () => {
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'char-owner');
    await seedUser(harness.db, 'corp-member');
    await seedCharacter(harness.db, 42, {
      corporationId: 100,
      affiliationRefreshedAt: new Date(),
    });
    await seedCharacter(harness.db, 43, {
      corporationId: 990,
      affiliationRefreshedAt: new Date(),
    });
    await seedEveAccount(harness.db, {
      id: 'acc-42',
      characterId: 42,
      userId: 'char-owner',
    });
    await seedEveAccount(harness.db, {
      id: 'acc-43',
      characterId: 43,
      userId: 'corp-member',
    });

    const mapId = '11111111-1111-4111-8111-111111111111';
    await harness.db.insert(maps).values({ id: mapId, userId: 'creator', name: 'Atlas' });
    await harness.db.insert(mapAccess).values([
      {
        mapId,
        ownerType: 'character',
        ownerId: 42,
        role: 'editor',
      },
      {
        mapId,
        ownerType: 'corporation',
        ownerId: 990,
        role: 'viewer',
      },
    ]);

    await expect(computeMapAccessClaims(mapId)).resolves.toEqual([
      { userId: 'char-owner', roles: ['editor'] },
      { userId: 'corp-member', roles: ['viewer'] },
      { userId: 'creator', roles: ['owner'] },
    ]);
  });
});
