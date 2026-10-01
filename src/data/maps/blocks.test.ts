import { describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import {
  blockAuthorizedMapCharacter,
  getAuthorizedMapBlocksForMaps,
  getBlockedMapUserIds,
  unblockAuthorizedMapCharacter,
} from './blocks';

vi.mock('@/db', () => ({ db: {} }));

const PRINCIPALS = { characterIds: [11], corporationIds: [] };

function returning(...rows: unknown[]) {
  const execute = vi.fn().mockResolvedValue(rows);
  return { database: { execute } as unknown as AnyPgDb, execute };
}

describe('map block queries', () => {
  it('reads a block attempt with or without a queued generation, and null without admin authority', async () => {
    await expect(blockAuthorizedMapCharacter('admin', PRINCIPALS, 'map-1', 42, returning({
      creatorUserId: 'creator', holderUserId: null, mapId: 'map-1', version: 'v1',
    }).database)).resolves.toEqual({
      creatorUserId: 'creator', holderUserId: null, pending: { mapId: 'map-1', version: 'v1' },
    });
    await expect(blockAuthorizedMapCharacter('admin', PRINCIPALS, 'map-1', 1, returning({
      creatorUserId: 'creator', holderUserId: 'creator', mapId: null, version: null,
    }).database)).resolves.toEqual({ creatorUserId: 'creator', holderUserId: 'creator', pending: null });
    await expect(blockAuthorizedMapCharacter('member', PRINCIPALS, 'map-1', 42, returning().database))
      .resolves.toBeNull();
  });

  it('returns the queued generation for an unblock, or null', async () => {
    await expect(unblockAuthorizedMapCharacter('admin', PRINCIPALS, 'map-1', 42, returning({
      mapId: 'map-1', version: 'v2',
    }).database)).resolves.toEqual({ mapId: 'map-1', version: 'v2' });
    await expect(unblockAuthorizedMapCharacter('member', PRINCIPALS, 'map-1', 42, returning().database))
      .resolves.toBeNull();
  });

  it('lists admin blocks with numeric ids and skips the read for no maps', async () => {
    const { database, execute } = returning({ mapId: 'map-1', characterId: '42' });
    await expect(getAuthorizedMapBlocksForMaps('admin', PRINCIPALS, ['map-1', 'map-1'], database))
      .resolves.toEqual([{ mapId: 'map-1', characterId: 42 }]);
    expect(execute).toHaveBeenCalledOnce();

    const idle = returning();
    await expect(getAuthorizedMapBlocksForMaps('admin', PRINCIPALS, [], idle.database)).resolves.toEqual([]);
    expect(idle.execute).not.toHaveBeenCalled();
  });

  it('lists the blocked account ids', async () => {
    await expect(getBlockedMapUserIds('map-1', returning({ userId: 'spy' }, { userId: 'buyer' }).database))
      .resolves.toEqual(['spy', 'buyer']);
  });
});
