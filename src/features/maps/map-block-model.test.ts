import { describe, expect, it } from 'vitest';
import { blockedPrincipals, mapBlockRevision, withBlock, withoutBlock } from './map-block-model';

const SPY = { characterId: 42, name: 'Spy' };
const ALT = { characterId: 43, name: 'Alt' };

describe('map block model', () => {
  it('adds a block once and removes it by character', () => {
    expect(withBlock([SPY], ALT)).toEqual([SPY, ALT]);
    expect(withBlock([SPY], SPY)).toEqual([SPY]);
    expect(withoutBlock([SPY, ALT], 42)).toEqual([ALT]);
  });

  it('keys the server snapshot by content, not order', () => {
    expect(mapBlockRevision([SPY, ALT])).toBe(mapBlockRevision([ALT, SPY]));
    expect(mapBlockRevision([SPY])).not.toBe(mapBlockRevision([{ ...SPY, name: 'Renamed' }]));
  });

  it('hides blocked characters from the block search', () => {
    expect(blockedPrincipals([SPY])).toEqual([{ ownerType: 'character', ownerId: 42 }]);
  });
});
