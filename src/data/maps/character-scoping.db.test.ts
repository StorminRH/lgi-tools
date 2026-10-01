import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { grandfatherCharacterGrants, listUnscopedMapIds } from './character-scoping';
import { mapAccess, maps, pendingMapAccessChanges } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_maps_character_scoping',
  tables: ['user', 'maps', 'map_access', 'map_access_changes'],
  foreignKeys: [
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const LEGACY = '11111111-1111-4111-8111-111111111111';
const SCOPED = '22222222-2222-4222-8222-222222222222';
const TOMBSTONED = '33333333-3333-4333-8333-333333333333';

async function seedMaps() {
  await seedUser(harness.db, 'creator');
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
  it('lists only live unscoped maps', async () => {
    await seedMaps();
    await expect(listUnscopedMapIds(10, harness.db)).resolves.toEqual([LEGACY]);
  });

  it('adds grants, stamps and queues in one step, and repeats without loss or duplication', async () => {
    await seedMaps();
    const first = await grandfatherCharacterGrants(LEGACY, [
      { characterId: 7, role: 'admin' },
      { characterId: 8, role: 'editor' },
    ], harness.db);
    expect(first?.mapId).toBe(LEGACY);
    expect(await legacyGrants()).toEqual([
      { ownerId: 7, role: 'viewer' },
      { ownerId: 8, role: 'editor' },
    ]);
    const [stamped] = await harness.db.select({ at: maps.characterScopedAt })
      .from(maps).where(eq(maps.id, LEGACY));
    expect(stamped?.at).toBeInstanceOf(Date);
    await expect(listUnscopedMapIds(10, harness.db)).resolves.toEqual([]);

    const second = await grandfatherCharacterGrants(LEGACY, [
      { characterId: 8, role: 'viewer' },
      { characterId: 9, role: 'viewer' },
    ], harness.db);
    expect(second?.version).not.toBe(first?.version);
    expect(await legacyGrants()).toEqual([
      { ownerId: 7, role: 'viewer' },
      { ownerId: 8, role: 'editor' },
      { ownerId: 9, role: 'viewer' },
    ]);
    const [restamped] = await harness.db.select({ at: maps.characterScopedAt })
      .from(maps).where(eq(maps.id, LEGACY));
    expect(restamped?.at).toEqual(stamped?.at);
    await expect(harness.db.select().from(pendingMapAccessChanges)).resolves.toHaveLength(1);
  });

  it('stamps a map with nothing to grandfather and ignores a tombstoned one', async () => {
    await seedMaps();
    await expect(grandfatherCharacterGrants(LEGACY, [], harness.db)).resolves.not.toBeNull();
    await expect(grandfatherCharacterGrants(TOMBSTONED, [{ characterId: 1, role: 'viewer' }], harness.db))
      .resolves.toBeNull();
    await expect(harness.db.select().from(mapAccess).where(eq(mapAccess.mapId, TOMBSTONED)))
      .resolves.toEqual([]);
  });
});
