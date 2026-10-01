import { describe, expect, it, vi } from 'vitest';
import { writeMapBlock } from './map-block-update';

vi.mock('@/data/maps/blocks', () => ({
  blockAuthorizedMapCharacter: vi.fn(),
  unblockAuthorizedMapCharacter: vi.fn(),
}));

const PRINCIPALS = { characterIds: [7], corporationIds: [] };
const PENDING = { mapId: 'map-1', version: 'v1' };
const BLOCK = { operation: 'block' as const, mapId: 'map-1', characterId: 42 };

function blockWith(attempt: unknown) {
  return { blockCharacter: vi.fn().mockResolvedValue(attempt) };
}

describe('writeMapBlock', () => {
  it('blocks another account and answers a character nobody holds the same way', async () => {
    for (const holderUserId of ['pilot', null]) {
      const writers = blockWith({ creatorUserId: 'creator', holderUserId, pending: PENDING });
      await expect(writeMapBlock('admin', PRINCIPALS, BLOCK, writers))
        .resolves.toEqual({ ok: true, pending: PENDING });
      expect(writers.blockCharacter).toHaveBeenCalledWith('admin', PRINCIPALS, 'map-1', 42);
    }
  });

  it('refuses the caller and the creator, and a caller without admin authority', async () => {
    await expect(writeMapBlock('admin', PRINCIPALS, BLOCK, blockWith({
      creatorUserId: 'creator', holderUserId: 'admin', pending: null,
    }))).resolves.toEqual({ ok: false, reason: 'block-self' });
    await expect(writeMapBlock('admin', PRINCIPALS, BLOCK, blockWith({
      creatorUserId: 'creator', holderUserId: 'creator', pending: null,
    }))).resolves.toEqual({ ok: false, reason: 'block-owner' });
    await expect(writeMapBlock('admin', PRINCIPALS, BLOCK, blockWith(null)))
      .resolves.toEqual({ ok: false, reason: 'forbidden' });
    await expect(writeMapBlock('admin', PRINCIPALS, BLOCK, blockWith({
      creatorUserId: 'creator', holderUserId: 'pilot', pending: null,
    }))).resolves.toEqual({ ok: false, reason: 'forbidden' });
  });

  it('unblocks only where the caller is admin', async () => {
    const unblockCharacter = vi.fn().mockResolvedValueOnce(PENDING).mockResolvedValueOnce(null);
    const unblock = { operation: 'unblock' as const, mapId: 'map-1', characterId: 42 };
    await expect(writeMapBlock('admin', PRINCIPALS, unblock, { unblockCharacter }))
      .resolves.toEqual({ ok: true, pending: PENDING });
    await expect(writeMapBlock('admin', PRINCIPALS, unblock, { unblockCharacter }))
      .resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(unblockCharacter).toHaveBeenCalledWith('admin', PRINCIPALS, 'map-1', 42);
  });
});
