import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { cancelPendingTracking } from '@/data/location-tracking/merge-store';
import { pendingTrackingMerges } from '@/data/location-tracking/schema';
import { insertGrandfatherGrants } from '@/data/maps/character-scoping';
import { account, user } from '@/db/auth-schema';
import { eq } from 'drizzle-orm';
import { mapAccess, maps } from '@/data/maps/schema';
import { computeMapAccessClaims } from './map-access-projection';
import { scopeLegacyMap } from './map-character-scoping';

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: vi.fn(() => { throw new Error('Scoping must not call ESI'); }),
}));

const harness = await createDbTestHarness({
  schema: 'test_map_character_scoping',
  tables: ['user', 'account', 'characters', 'pending_tracking_merges', 'maps', 'map_access', 'map_blocks', 'map_block_accounts', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_blocks', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_block_accounts', column: 'block_id', refTable: 'map_blocks', refColumn: 'id', onDelete: 'cascade' },
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
    const freezeTracking = vi.fn().mockResolvedValue(tracked);

    await expect(computeMapAccessClaims(MAP_ID)).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'member', roles: ['editor'] },
    ]);
    await expect(scopeLegacyMap(MAP_ID, { freezeTracking, deliver })).resolves.toBe(true);
    await expect(scopeLegacyMap(MAP_ID, { freezeTracking, deliver })).resolves.toBe(true);

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
  async function seedTransferSource() {
    for (const userId of ['creator', 'source', 'survivor']) await seedUser(harness.db, userId);
    for (const [characterId, corporationId] of [[11, 990], [12, 991]] as const) {
      await seedCharacter(harness.db, characterId, { name: `Pilot ${characterId}`, corporationId });
      await seedEveAccount(harness.db, { id: `source-${characterId}`, characterId, userId: 'source' }, { refreshToken: 'valid' });
    }
    await harness.db.insert(maps).values({ id: MAP_ID, userId: 'creator', name: 'Cutover merge' });
    await harness.db.insert(mapAccess).values({
      mapId: MAP_ID, ownerType: 'corporation', ownerId: 990, role: 'editor',
    });
  }

  async function commitTransfer() {
    await harness.db.transaction(async (tx) => {
      await tx.update(account).set({ userId: 'survivor' }).where(eq(account.userId, 'source'));
      await tx.insert(pendingTrackingMerges).values({
        userId: 'survivor', sourceUserId: 'source', selections: [{ mapId: MAP_ID, characterId: 12 }],
      });
      await tx.delete(user).where(eq(user.id, 'source'));
    });
  }

  it('grandfathers durable survivor selections after source teardown without replaying tracking', async () => {
    await seedTransferSource();
    await commitTransfer();
    const freezeTracking = vi.fn().mockResolvedValue([]);
    const deliver = vi.fn().mockResolvedValue({ processed: 1, failed: 0 });
    await expect(scopeLegacyMap(MAP_ID, { freezeTracking, deliver })).resolves.toBe(true);
    await expect(harness.db.select({ ownerId: mapAccess.ownerId, role: mapAccess.role }).from(mapAccess)
      .where(eq(mapAccess.ownerId, 12))).resolves.toEqual([{ ownerId: 12, role: 'editor' }]);
    await expect(harness.db.select().from(pendingTrackingMerges)).resolves.toHaveLength(1);
    expect(freezeTracking).toHaveBeenCalledOnce();
  });

  it('catches a merge job committed inside the grandfather write before stamping', async () => {
    await seedTransferSource();
    const freezeTracking = vi.fn().mockResolvedValue([{ userId: 'source', characterId: 12 }]);
    let writes = 0;
    const grandfather = vi.fn(async (...args: Parameters<typeof insertGrandfatherGrants>) => {
      if (writes++ === 0) await commitTransfer();
      await insertGrandfatherGrants(args[0], args[1], args[2], harness.db);
    });
    await expect(scopeLegacyMap(MAP_ID, {
      freezeTracking, grandfather, deliver: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
    })).resolves.toBe(true);
    expect(grandfather).toHaveBeenCalledTimes(2);
    expect(grandfather).toHaveBeenLastCalledWith(MAP_ID, [
      { userId: 'survivor', characterId: 12, role: 'editor' },
    ], expect.any(Date));
    await expect(harness.db.select({ ownerId: mapAccess.ownerId }).from(mapAccess)
      .where(eq(mapAccess.ownerId, 12))).resolves.toEqual([{ ownerId: 12 }]);
    expect(freezeTracking).toHaveBeenCalledOnce();
  });

  it('follows a pending survivor retargeted by another merge during the grant write', async () => {
    await seedTransferSource();
    await commitTransfer();
    await seedUser(harness.db, 'older-survivor');
    let writes = 0;
    const grandfather = vi.fn(async (...args: Parameters<typeof insertGrandfatherGrants>) => {
      if (writes++ === 0) {
        await harness.db.transaction(async (tx) => {
          await tx.update(account).set({ userId: 'older-survivor' }).where(eq(account.userId, 'survivor'));
          await tx.update(pendingTrackingMerges).set({ userId: 'older-survivor' });
          await tx.delete(user).where(eq(user.id, 'survivor'));
        });
      }
      await insertGrandfatherGrants(args[0], args[1], args[2], harness.db);
    });
    await expect(scopeLegacyMap(MAP_ID, {
      freezeTracking: vi.fn().mockResolvedValue([]), grandfather,
      deliver: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
    })).resolves.toBe(true);
    expect(grandfather).toHaveBeenCalledTimes(2);
    expect(grandfather).toHaveBeenLastCalledWith(MAP_ID, [
      { userId: 'older-survivor', characterId: 12, role: 'editor' },
    ], expect.any(Date));
    await expect(harness.db.select({ ownerId: mapAccess.ownerId }).from(mapAccess)
      .where(eq(mapAccess.ownerId, 12))).resolves.toEqual([{ ownerId: 12 }]);
  });

  it('does not grandfather an opt-out removed from pending merge selections', async () => {
    await seedTransferSource();
    await commitTransfer();
    await cancelPendingTracking('survivor', 12);
    await expect(scopeLegacyMap(MAP_ID, {
      freezeTracking: vi.fn().mockResolvedValue([]),
      deliver: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
    })).resolves.toBe(true);
    await expect(harness.db.select({ ownerId: mapAccess.ownerId }).from(mapAccess)
      .where(eq(mapAccess.ownerId, 12))).resolves.toEqual([]);
    await expect(computeMapAccessClaims(MAP_ID)).resolves.toMatchObject([
      { userId: 'creator' }, { userId: 'survivor', characters: [{ characterId: 11 }] },
    ]);
  });

});
