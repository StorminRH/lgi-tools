import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { mapAccess, maps } from '@/data/maps/schema';
import { computeMapAccessClaims } from './map-access-projection';
import { scopeLegacyMap } from './map-character-scoping';

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: vi.fn(() => { throw new Error('Scoping must not call ESI'); }),
}));

const harness = await createDbTestHarness({
  schema: 'test_map_character_scoping',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const MAP_ID = '44444444-4444-4444-8444-444444444444';

describe.skipIf(!harness.reachable)('scopeLegacyMap (real Postgres)', () => {
  it('keeps every owned tracked character trackable once the map is scoped, idempotently', async () => {
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'member');
    await seedCharacter(harness.db, 41, { name: 'Creator Main', corporationId: 100 });
    await seedCharacter(harness.db, 43, { name: 'Member Main', corporationId: 990 });
    await seedCharacter(harness.db, 44, { name: 'Member Alt', corporationId: 991 });
    for (const [id, userId] of [[41, 'creator'], [43, 'member'], [44, 'member']] as const) {
      await seedEveAccount(harness.db, { id: `acc-${id}`, characterId: id, userId }, { refreshToken: 'valid' });
    }
    await harness.db.insert(maps).values({ id: MAP_ID, userId: 'creator', name: 'Legacy' });
    await harness.db.insert(mapAccess).values({
      mapId: MAP_ID, ownerType: 'corporation', ownerId: 990, role: 'editor',
    });

    const tracked = [
      { userId: 'creator', characterId: 41 },
      { userId: 'member', characterId: 43 },
      { userId: 'member', characterId: 44 },
      { userId: 'member', characterId: 777 },
    ];
    const deliver = vi.fn().mockResolvedValue({ processed: 1, failed: 0 });
    const readTracked = vi.fn().mockResolvedValue(tracked);

    await expect(computeMapAccessClaims(MAP_ID)).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'member', roles: ['editor'] },
    ]);
    await expect(scopeLegacyMap(MAP_ID, { readTracked, deliver })).resolves.toBe(true);
    await expect(scopeLegacyMap(MAP_ID, { readTracked, deliver })).resolves.toBe(true);

    await expect(computeMapAccessClaims(MAP_ID)).resolves.toEqual([
      { userId: 'creator', roles: ['admin'], characters: [{ characterId: 41, name: 'Creator Main' }] },
      { userId: 'member', roles: ['editor'], characters: [
        { characterId: 43, name: 'Member Main' }, { characterId: 44, name: 'Member Alt' },
      ] },
    ]);
    const grants = await harness.db.select({
      ownerType: mapAccess.ownerType, ownerId: mapAccess.ownerId, role: mapAccess.role,
    }).from(mapAccess);
    expect(grants.sort((left, right) => left.ownerId - right.ownerId)).toEqual([
      { ownerType: 'character', ownerId: 41, role: 'admin' },
      { ownerType: 'character', ownerId: 44, role: 'editor' },
      { ownerType: 'corporation', ownerId: 990, role: 'editor' },
    ]);
  });
});
