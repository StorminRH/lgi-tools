import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
  seedCharacter,
  seedEveAccount,
} from '@/db/__tests__/support/db-test-harness';
import { account } from '@/db/auth-schema';
import { insertGrandfatherGrants, listUnscopedMapIds, stampCharacterScoped } from './character-scoping';
import { mapAccess, mapBlocks, maps, pendingMapAccessChanges } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_maps_character_scoping',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_blocks', 'map_block_accounts', 'map_access_changes'],
  foreignKeys: [
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_blocks', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_block_accounts', column: 'block_id', refTable: 'map_blocks', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const LEGACY = '11111111-1111-4111-8111-111111111111';
const SCOPED = '22222222-2222-4222-8222-222222222222';
const TOMBSTONED = '33333333-3333-4333-8333-333333333333';
const CUTOFF = new Date(Date.now() - 24 * 60 * 60 * 1000);
const ARCHIVED = '55555555-5555-4555-8555-555555555555';

async function seedMaps() {
  await seedUser(harness.db, 'creator');
  for (const characterId of [7, 8, 9]) {
    await seedEveAccount(harness.db, { id: `creator-${characterId}`, characterId, userId: 'creator' }, { refreshToken: 'valid' });
  }
  await harness.db.insert(maps).values([
    { id: LEGACY, userId: 'creator', name: 'Legacy' },
    { id: SCOPED, userId: 'creator', name: 'Scoped', characterScopedAt: new Date() },
    { id: TOMBSTONED, userId: 'creator', name: 'Gone', tombstonedAt: new Date() },
  ]);
  await harness.db.insert(mapAccess).values({
    mapId: LEGACY, ownerType: 'character', ownerId: 7, role: 'viewer',
  });
}

async function legacyGrants() {
  return (await harness.db.select({ ownerId: mapAccess.ownerId, role: mapAccess.role })
    .from(mapAccess).where(eq(mapAccess.mapId, LEGACY)))
    .sort((left, right) => left.ownerId - right.ownerId);
}

describe.skipIf(!harness.reachable)('character scoping backfill (real Postgres)', () => {
  it('lists only active unscoped maps', async () => {
    await seedMaps();
    await harness.db.insert(maps).values({
      id: ARCHIVED, userId: 'creator', name: 'Archived', archivedAt: new Date(),
    });
    await expect(listUnscopedMapIds(10, harness.db)).resolves.toEqual([LEGACY]);
  });

  it('adds grants without stamping, keeps existing grants, and repeats without duplication', async () => {
    await seedMaps();
    await insertGrandfatherGrants(LEGACY, [
      { userId: 'creator', characterId: 7, role: 'admin' },
      { userId: 'creator', characterId: 8, role: 'editor' },
    ], CUTOFF, harness.db);
    await insertGrandfatherGrants(LEGACY, [
      { userId: 'creator', characterId: 8, role: 'viewer' },
      { userId: 'creator', characterId: 9, role: 'viewer' },
    ], CUTOFF, harness.db);
    await insertGrandfatherGrants(LEGACY, [], CUTOFF, harness.db);
    expect(await legacyGrants()).toEqual([
      { ownerId: 7, role: 'viewer' },
      { ownerId: 8, role: 'editor' },
      { ownerId: 9, role: 'viewer' },
    ]);
    await expect(listUnscopedMapIds(10, harness.db)).resolves.toEqual([LEGACY]);
    await expect(harness.db.select().from(pendingMapAccessChanges)).resolves.toEqual([]);
  });

  async function seedMember() {
    await seedMaps();
    await seedUser(harness.db, 'member');
    for (const [characterId, corporationId] of [[10, 990], [11, 991]] as const) {
      await seedCharacter(harness.db, characterId, { corporationId });
      await seedEveAccount(harness.db, { id: `member-${characterId}`, characterId: characterId, userId: 'member' }, { refreshToken: 'valid' });
    }
    await harness.db.insert(mapAccess).values({
      mapId: LEGACY, ownerType: 'corporation', ownerId: 990, role: 'editor',
    });
  }

  const candidate = [{ userId: 'member', characterId: 11, role: 'editor' as const }];
  const insertCandidate = () => insertGrandfatherGrants(LEGACY, candidate, CUTOFF, harness.db);

  it('does not resurrect access revoked after the snapshot', async () => {
    await seedMember();
    await harness.db.delete(mapAccess).where(eq(mapAccess.ownerId, 990));
    await insertCandidate();
    expect(await legacyGrants()).toEqual([{ ownerId: 7, role: 'viewer' }]);
  });

  it('waits for a concurrent revoke map lock and reads its committed revocation', async () => {
    await seedMember();
    let settled = false;
    let writing: Promise<void> = Promise.resolve();
    await harness.sql.begin(async (holder) => {
      await holder.unsafe('SELECT id FROM "test_maps_character_scoping"."maps" WHERE id = $1 FOR UPDATE', [LEGACY]);
      writing = insertCandidate().finally(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
      await holder.unsafe('DELETE FROM "test_maps_character_scoping"."map_access" WHERE owner_id = $1', [990]);
    });
    await writing;
    expect(await legacyGrants()).toEqual([{ ownerId: 7, role: 'viewer' }]);
  });

  it('caps a stale role at the current grant after a downgrade', async () => {
    await seedMember();
    await harness.db.update(mapAccess).set({ role: 'viewer' }).where(eq(mapAccess.ownerId, 990));
    await insertCandidate();
    expect(await legacyGrants()).toContainEqual({ ownerId: 11, role: 'viewer' });
  });

  it('does not carry a character that moved to another account after the snapshot', async () => {
    await seedMember();
    await seedUser(harness.db, 'buyer');
    await harness.db.update(account).set({ userId: 'buyer' }).where(eq(account.id, 'member-11'));
    await insertCandidate();
    expect(await legacyGrants()).not.toContainEqual({ ownerId: 11, role: 'editor' });
  });

  it('rechecks blocks and working authorization when deriving current access', async () => {
    await seedMember();
    await harness.db.insert(mapBlocks).values({ mapId: LEGACY, characterId: 10 });
    await insertCandidate();
    expect(await legacyGrants()).not.toContainEqual({ ownerId: 11, role: 'editor' });
    await harness.db.delete(mapBlocks);
    await harness.db.update(account).set({ authorizationFailureFirstAt: new Date(CUTOFF.getTime() - 1) })
      .where(eq(account.id, 'member-10'));
    await insertCandidate();
    expect(await legacyGrants()).not.toContainEqual({ ownerId: 11, role: 'editor' });
  });

  it('keeps a reconnecting owned alt when another working character still grants map access', async () => {
    await seedMember();
    await harness.db.update(account).set({ refreshToken: null }).where(eq(account.id, 'member-11'));
    await insertCandidate();
    expect(await legacyGrants()).toContainEqual({ ownerId: 11, role: 'editor' });
  });

  it('does not add a permanent character grant when a new corporation grant already qualifies it', async () => {
    await seedMember();
    await harness.db.insert(mapAccess).values({
      mapId: LEGACY, ownerType: 'corporation', ownerId: 991, role: 'viewer',
    });
    await insertCandidate();
    expect((await legacyGrants()).some((grant) => grant.ownerId === 11)).toBe(false);
  });

  it('uses a transactional direct writer when the request driver is Neon HTTP', async () => {
    await seedMaps();
    vi.stubEnv('LOCAL_DB_DRIVER', '');
    try {
      await insertGrandfatherGrants(LEGACY, [{ userId: 'creator', characterId: 8, role: 'editor' }], CUTOFF);
      expect(await legacyGrants()).toContainEqual({ ownerId: 8, role: 'editor' });
    } finally {
      vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    }
  });

  it('stamps once and queues a fresh reprojection each time, ignoring a tombstoned map', async () => {
    await seedMaps();
    const first = await stampCharacterScoped(LEGACY, harness.db);
    expect(first?.mapId).toBe(LEGACY);
    const [stamped] = await harness.db.select({ at: maps.characterScopedAt })
      .from(maps).where(eq(maps.id, LEGACY));
    expect(stamped?.at).toBeInstanceOf(Date);
    await expect(listUnscopedMapIds(10, harness.db)).resolves.toEqual([]);

    const second = await stampCharacterScoped(LEGACY, harness.db);
    expect(second?.version).not.toBe(first?.version);
    const [restamped] = await harness.db.select({ at: maps.characterScopedAt })
      .from(maps).where(eq(maps.id, LEGACY));
    expect(restamped?.at).toEqual(stamped?.at);
    await expect(harness.db.select().from(pendingMapAccessChanges)).resolves.toHaveLength(1);

    await expect(stampCharacterScoped(TOMBSTONED, harness.db)).resolves.toBeNull();
  });
});
