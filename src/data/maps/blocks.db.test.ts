import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { account, user } from '@/db/auth-schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import type { MapPrincipals } from './access';
import {
  blockAuthorizedMapCharacter,
  getAuthorizedMapBlocksForMaps,
  getBlockedMapUserIds,
  unblockAuthorizedMapCharacter,
} from './blocks';
import { forgetMapBlockAccounts, mergeMapBlocks } from './purge';
import {
  enqueueAffectedMapAccessChanges,
  enqueueMergeReprojection,
  getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
} from './queries';
import { archiveAuthorizedMap } from './lifecycle';
import { mapAccess, mapBlocks, maps, pendingMapAccessChanges } from './schema';

const MAP = '11111111-1111-4111-8111-111111111111';
const CORP = 990;
const ADMIN: MapPrincipals = { characterIds: [11], corporationIds: [] };
const SPY: MapPrincipals = { characterIds: [20, 21], corporationIds: [CORP] };
const MEMBER: MapPrincipals = { characterIds: [30], corporationIds: [CORP] };

const harness = await createDbTestHarness({
  schema: 'test_maps_blocks',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_blocks', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_blocks', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_blocks', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'set null' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

let linkSeq = 0;
async function link(userId: string, characterId: number): Promise<void> {
  linkSeq += 1;
  await seedEveAccount(harness.db, { id: `link-${linkSeq}`, characterId, userId });
}

/**
 * creator (char 1) owns MAP; admin (char 11) and admin2 (char 12) hold admin
 * grants; the corporation is an editor; spy holds a corp member (20) and an
 * out-of-corp alt (21) granted by character; member (30) is a plain editor.
 */
async function seedMap(): Promise<void> {
  for (const id of ['creator', 'admin', 'admin2', 'spy', 'member', 'buyer', 'main']) {
    await seedUser(harness.db, id);
  }
  for (const [characterId, corporationId] of [[1, 500], [11, 501], [12, 502], [20, CORP], [21, 503], [30, CORP]] as const) {
    await seedCharacter(harness.db, characterId, { corporationId });
  }
  await link('creator', 1);
  await link('admin', 11);
  await link('admin2', 12);
  await link('spy', 20);
  await link('spy', 21);
  await link('member', 30);
  await harness.db.insert(maps).values({ id: MAP, userId: 'creator', name: 'Chain' });
  await harness.db.insert(mapAccess).values([
    { mapId: MAP, ownerType: 'character', ownerId: 1, role: 'admin' },
    { mapId: MAP, ownerType: 'character', ownerId: 11, role: 'admin' },
    { mapId: MAP, ownerType: 'character', ownerId: 12, role: 'admin' },
    { mapId: MAP, ownerType: 'character', ownerId: 21, role: 'viewer' },
    { mapId: MAP, ownerType: 'corporation', ownerId: CORP, role: 'editor' },
  ]);
}

async function listedMapIds(userId: string, principals: MapPrincipals): Promise<string[]> {
  return (await listAuthorizedMapsForPrincipals(userId, principals)).map((map) => map.id);
}

function storedBlocks() {
  return harness.db
    .select({
      characterId: mapBlocks.characterId,
      userId: mapBlocks.userId,
      blockedByUserId: mapBlocks.blockedByUserId,
    })
    .from(mapBlocks)
    .orderBy(mapBlocks.characterId);
}

describe.skipIf(!harness.reachable)('map blocks (real Postgres)', () => {
  it('keeps every character of the blocked account off the map, including a character-granted alt', async () => {
    await seedMap();
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([MAP]);

    const attempt = await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    expect(attempt).toMatchObject({ creatorUserId: 'creator', holderUserId: 'spy' });
    expect(attempt?.pending?.mapId).toBe(MAP);

    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 20, userId: 'spy', blockedByUserId: 'admin' },
    ]);
    await expect(getBlockedMapUserIds(MAP)).resolves.toEqual(['spy']);
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([]);
    await expect(listedMapIds('spy', { characterIds: [21], corporationIds: [] })).resolves.toEqual([]);
    await expect(listedMapIds('member', MEMBER)).resolves.toEqual([MAP]);
    await expect(getAuthorizedMapBlocksForMaps('admin', ADMIN, [MAP]))
      .resolves.toEqual([{ mapId: MAP, characterId: 20 }]);
  });

  it('refuses the creator\'s and the caller\'s own characters without writing or queueing', async () => {
    await seedMap();

    await expect(blockAuthorizedMapCharacter('admin', ADMIN, MAP, 1)).resolves.toEqual({
      creatorUserId: 'creator', holderUserId: 'creator', pending: null,
    });
    await expect(blockAuthorizedMapCharacter('admin', ADMIN, MAP, 11)).resolves.toEqual({
      creatorUserId: 'creator', holderUserId: 'admin', pending: null,
    });
    await expect(storedBlocks()).resolves.toEqual([]);
    await expect(harness.db.select().from(pendingMapAccessChanges)).resolves.toEqual([]);
  });

  it('stores a character nobody on LGI.tools holds and answers exactly like any other block', async () => {
    await seedMap();

    const unknown = await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 999);
    const known = await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 30);
    expect(unknown?.pending).not.toBeNull();
    expect(known?.pending).not.toBeNull();
    expect(unknown?.creatorUserId).toBe(known?.creatorUserId);
    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 30, userId: 'member', blockedByUserId: 'admin' },
      { characterId: 999, userId: null, blockedByUserId: 'admin' },
    ]);

    await link('buyer', 999);
    await expect(getBlockedMapUserIds(MAP).then((ids) => ids.sort())).resolves.toEqual(['buyer', 'member']);
  });

  it('keeps the account that held the character blocked after an unlink, and blocks whoever links it next', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await harness.db.delete(pendingMapAccessChanges);

    await harness.db.delete(account).where(and(eq(account.userId, 'spy'), eq(account.accountId, '20')));
    await expect(getBlockedMapUserIds(MAP)).resolves.toEqual(['spy']);
    await expect(listedMapIds('spy', { characterIds: [21], corporationIds: [] })).resolves.toEqual([]);

    await link('buyer', 20);
    await expect(getBlockedMapUserIds(MAP).then((ids) => ids.sort())).resolves.toEqual(['buyer', 'spy']);
    await expect(listedMapIds('buyer', { characterIds: [20], corporationIds: [CORP] })).resolves.toEqual([]);
    const affected = await enqueueAffectedMapAccessChanges(20);
    expect(affected.map((change) => change.mapId)).toContain(MAP);
  });

  it('gives access back on unblock', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);

    const pending = await unblockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    expect(pending?.mapId).toBe(MAP);
    await expect(storedBlocks()).resolves.toEqual([]);
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([MAP]);
  });

  it('lets only map admins see, add, or remove blocks', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);

    await expect(blockAuthorizedMapCharacter('member', MEMBER, MAP, 1)).resolves.toBeNull();
    await expect(blockAuthorizedMapCharacter('member', MEMBER, MAP, 21)).resolves.toBeNull();
    await expect(unblockAuthorizedMapCharacter('member', MEMBER, MAP, 20)).resolves.toBeNull();
    await expect(getAuthorizedMapBlocksForMaps('member', MEMBER, [MAP])).resolves.toEqual([]);
    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 20, userId: 'spy', blockedByUserId: 'admin' },
    ]);
  });

  it('strips a blocked admin of admin authority but never the creator', async () => {
    await seedMap();
    const admin2: MapPrincipals = { characterIds: [12], corporationIds: [] };
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 12);

    await expect(listedMapIds('admin2', admin2)).resolves.toEqual([]);
    await expect(getAuthorizedMapGrantsForMaps('admin2', admin2, [MAP])).resolves.toEqual([]);
    await expect(blockAuthorizedMapCharacter('admin2', admin2, MAP, 20)).resolves.toBeNull();
    await expect(archiveAuthorizedMap('admin2', admin2, MAP)).resolves.toBeNull();

    // A creator who later links a blocked character keeps the map.
    await harness.db.insert(mapBlocks).values({ mapId: MAP, characterId: 1, userId: null });
    await expect(listedMapIds('creator', { characterIds: [1], corporationIds: [] })).resolves.toEqual([MAP]);
    await expect(getAuthorizedMapBlocksForMaps('creator', { characterIds: [1], corporationIds: [] }, [MAP]))
      .resolves.toHaveLength(2);
    await expect(archiveAuthorizedMap('admin', ADMIN, MAP)).resolves.not.toBeNull();
    await expect(listDeletedRestorableMapsForPrincipals('admin2', admin2)).resolves.toEqual([]);
  });

  it('moves both account columns to the merge survivor and reprojects the maps blocking the source', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await harness.db.insert(mapBlocks).values({
      mapId: MAP, characterId: 30, userId: 'member', blockedByUserId: 'spy',
    });
    await harness.db.delete(pendingMapAccessChanges);

    await harness.db.delete(account).where(eq(account.userId, 'spy'));
    const captured = await enqueueMergeReprojection(harness.db, { sourceUserId: 'spy', movedCharacterIds: [] });
    expect(captured.map((change) => change.mapId)).toEqual([MAP]);

    await mergeMapBlocks(harness.db, { sourceUserId: 'spy', survivorUserId: 'main' });
    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 20, userId: 'main', blockedByUserId: 'admin' },
      { characterId: 30, userId: 'member', blockedByUserId: 'main' },
    ]);
    await expect(listedMapIds('main', { characterIds: [], corporationIds: [CORP] })).resolves.toEqual([]);
  });

  it('clears a deleted account from its blocks and keeps the character blocked', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 30);

    await forgetMapBlockAccounts('admin');
    await harness.db.delete(account).where(eq(account.userId, 'spy'));
    await harness.db.delete(user).where(eq(user.id, 'spy'));
    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 20, userId: null, blockedByUserId: null },
      { characterId: 30, userId: 'member', blockedByUserId: null },
    ]);

    await forgetMapBlockAccounts('member');
    await expect(storedBlocks()).resolves.toEqual([
      { characterId: 20, userId: null, blockedByUserId: null },
      { characterId: 30, userId: null, blockedByUserId: null },
    ]);
    await expect(listedMapIds('member', MEMBER)).resolves.toEqual([]);
  });
});
