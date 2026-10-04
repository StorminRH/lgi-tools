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
import { mapAccess, mapBlockAccounts, mapBlocks, maps, pendingMapAccessChanges } from './schema';

const MAP = '11111111-1111-4111-8111-111111111111';
const CORP = 990;
const ADMIN: MapPrincipals = { characterIds: [11], corporationIds: [] };
const SPY: MapPrincipals = { characterIds: [20, 21], corporationIds: [CORP] };
const MEMBER: MapPrincipals = { characterIds: [30], corporationIds: [CORP] };

const harness = await createDbTestHarness({
  schema: 'test_maps_blocks',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_blocks', 'map_block_accounts', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_blocks', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_block_accounts', column: 'block_id', refTable: 'map_blocks', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_block_accounts', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
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

/** Each block as `character:blocker:holder,holder`, sorted. */
async function storedBlocks(): Promise<string[]> {
  const blocks = await harness.db.select().from(mapBlocks);
  const holders = await harness.db.select().from(mapBlockAccounts);
  return blocks
    .map((block) => {
      const held = holders
        .filter((holder) => holder.blockId === block.id)
        .map((holder) => holder.userId)
        .sort();
      return `${block.characterId}:${block.blockedByUserId ?? '-'}:${held.join(',')}`;
    })
    .sort();
}

/** What the link-change path runs after a character is linked or moved. */
async function linkThroughHook(userId: string, characterId: number): Promise<void> {
  await link(userId, characterId);
  await enqueueAffectedMapAccessChanges(characterId);
}

async function unlink(userId: string, characterId: number): Promise<void> {
  await enqueueAffectedMapAccessChanges(characterId);
  await harness.db.delete(account)
    .where(and(eq(account.userId, userId), eq(account.accountId, String(characterId))));
}

const NOBODY: MapPrincipals = { characterIds: [], corporationIds: [CORP] };

describe.skipIf(!harness.reachable)('map blocks (real Postgres)', () => {
  it('keeps every character of the blocked account off the map, including a character-granted alt', async () => {
    await seedMap();
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([MAP]);

    const attempt = await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    expect(attempt).toMatchObject({ creatorUserId: 'creator', holderUserId: 'spy' });
    expect(attempt?.pending?.mapId).toBe(MAP);

    await expect(storedBlocks()).resolves.toEqual(['20:admin:spy']);
    await expect(getBlockedMapUserIds(MAP)).resolves.toEqual(['spy']);
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([]);
    await expect(listedMapIds('spy', { characterIds: [21], corporationIds: [] })).resolves.toEqual([]);
    await expect(listedMapIds('member', MEMBER)).resolves.toEqual([MAP]);
    await expect(getAuthorizedMapBlocksForMaps('admin', ADMIN, [MAP]))
      .resolves.toEqual([{ mapId: MAP, characterId: 20 }]);

    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await expect(storedBlocks()).resolves.toEqual(['20:admin:spy']);
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
    await expect(storedBlocks()).resolves.toEqual(['30:admin:member', '999:admin:']);

    await link('buyer', 999);
    await expect(getBlockedMapUserIds(MAP).then((ids) => ids.sort())).resolves.toEqual(['buyer', 'member']);
  });

  it('keeps an account blocked after it links and unlinks a character blocked while nobody held it', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 999);

    await linkThroughHook('buyer', 999);
    await unlink('buyer', 999);
    await expect(storedBlocks()).resolves.toEqual(['999:admin:buyer']);
    await expect(getBlockedMapUserIds(MAP)).resolves.toEqual(['buyer']);
    await expect(listedMapIds('buyer', NOBODY)).resolves.toEqual([]);
  });

  it('keeps every account along a sale chain blocked', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);

    await unlink('spy', 20);
    await linkThroughHook('buyer', 20);
    await unlink('buyer', 20);
    await linkThroughHook('main', 20);

    await expect(storedBlocks()).resolves.toEqual(['20:admin:buyer,main,spy']);
    for (const holder of ['spy', 'buyer', 'main']) {
      await expect(listedMapIds(holder, NOBODY)).resolves.toEqual([]);
    }
    const affected = await enqueueAffectedMapAccessChanges(20);
    expect(affected.map((change) => change.mapId)).toContain(MAP);
  });

  it('never records the map creator, who keeps the map', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 999);

    await linkThroughHook('creator', 999);
    await unlink('creator', 999);
    await expect(storedBlocks()).resolves.toEqual(['999:admin:']);
    await expect(listedMapIds('creator', { characterIds: [1], corporationIds: [] })).resolves.toEqual([MAP]);
  });

  it('gives access back on unblock and removes its recorded holders', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);

    const pending = await unblockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    expect(pending?.mapId).toBe(MAP);
    await expect(storedBlocks()).resolves.toEqual([]);
    await expect(harness.db.select().from(mapBlockAccounts)).resolves.toEqual([]);
    await expect(listedMapIds('spy', SPY)).resolves.toEqual([MAP]);
  });

  it('lets only map admins see, add, or remove blocks', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);

    await expect(blockAuthorizedMapCharacter('member', MEMBER, MAP, 1)).resolves.toBeNull();
    await expect(blockAuthorizedMapCharacter('member', MEMBER, MAP, 21)).resolves.toBeNull();
    await expect(unblockAuthorizedMapCharacter('member', MEMBER, MAP, 20)).resolves.toBeNull();
    await expect(getAuthorizedMapBlocksForMaps('member', MEMBER, [MAP])).resolves.toEqual([]);
    await expect(storedBlocks()).resolves.toEqual(['20:admin:spy']);
  });

  it('strips a blocked admin of admin authority but never the creator', async () => {
    await seedMap();
    const admin2: MapPrincipals = { characterIds: [12], corporationIds: [] };
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 12);

    await expect(listedMapIds('admin2', admin2)).resolves.toEqual([]);
    await expect(getAuthorizedMapGrantsForMaps('admin2', admin2, [MAP])).resolves.toEqual([]);
    await expect(blockAuthorizedMapCharacter('admin2', admin2, MAP, 20)).resolves.toBeNull();
    await expect(archiveAuthorizedMap('admin2', admin2, MAP)).resolves.toBeNull();

    // A creator who holds a blocked character keeps the map.
    await harness.db.insert(mapBlocks).values({ mapId: MAP, characterId: 1 });
    await expect(listedMapIds('creator', { characterIds: [1], corporationIds: [] })).resolves.toEqual([MAP]);
    await expect(getAuthorizedMapBlocksForMaps('creator', { characterIds: [1], corporationIds: [] }, [MAP]))
      .resolves.toHaveLength(2);
    await expect(archiveAuthorizedMap('admin', ADMIN, MAP)).resolves.not.toBeNull();
    await expect(listDeletedRestorableMapsForPrincipals('admin2', admin2)).resolves.toEqual([]);
  });

  it('moves holder rows to the merge survivor once, drops them where the survivor created the map, and reprojects', async () => {
    await seedMap();
    const own = '22222222-2222-4222-8222-222222222222';
    await harness.db.insert(maps).values({ id: own, userId: 'main', name: 'Main map' });
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 30);
    const [ownBlock] = await harness.db.insert(mapBlocks)
      .values({ mapId: own, characterId: 21, blockedByUserId: 'spy' })
      .returning({ id: mapBlocks.id });
    const [memberBlock] = await harness.db.select({ id: mapBlocks.id }).from(mapBlocks)
      .where(eq(mapBlocks.characterId, 30));
    await harness.db.insert(mapBlockAccounts).values([
      { blockId: ownBlock!.id, userId: 'spy' },
      { blockId: memberBlock!.id, userId: 'spy' },
      { blockId: memberBlock!.id, userId: 'main' },
    ]);
    await harness.db.delete(pendingMapAccessChanges);

    await harness.db.delete(account).where(eq(account.userId, 'spy'));
    const captured = await enqueueMergeReprojection(harness.db, { sourceUserId: 'spy', movedCharacterIds: [] });
    expect(captured.map((change) => change.mapId).sort()).toEqual([MAP, own].sort());

    await mergeMapBlocks(harness.db, { sourceUserId: 'spy', survivorUserId: 'main' });
    await expect(storedBlocks()).resolves.toEqual([
      '20:admin:main',
      '21:main:',
      '30:admin:main,member',
    ]);
    await expect(listedMapIds('main', NOBODY)).resolves.toEqual([own]);
  });

  it('removes a deleted account from its blocks and keeps the characters blocked', async () => {
    await seedMap();
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 20);
    await blockAuthorizedMapCharacter('admin', ADMIN, MAP, 30);

    await forgetMapBlockAccounts('admin');
    await harness.db.delete(account).where(eq(account.userId, 'spy'));
    await harness.db.delete(user).where(eq(user.id, 'spy'));
    await expect(storedBlocks()).resolves.toEqual(['20:-:', '30:-:member']);

    await forgetMapBlockAccounts('member');
    await expect(storedBlocks()).resolves.toEqual(['20:-:', '30:-:']);
    await expect(listedMapIds('member', MEMBER)).resolves.toEqual([]);
  });
});
