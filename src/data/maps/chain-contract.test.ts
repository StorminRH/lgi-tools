import { describe, expect, it } from 'vitest';
import {
  chainTombstoneState,
  chainTombstoneStamps,
  isTombstoned,
  MAP_CHAIN_UNDO_WINDOW_MS,
} from './chain-contract';

describe('chain-contract', () => {
  it('pairs purgeAfter exactly one undo window after deletedAt', () => {
    const deletedAt = 1_700_000_000_000;
    expect(MAP_CHAIN_UNDO_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(chainTombstoneStamps(deletedAt)).toEqual({
      deletedAt,
      purgeAfter: deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
    });
  });

  it('normalizes absent and null deletedAt as active', () => {
    expect(isTombstoned({})).toBe(false);
    expect(isTombstoned({ deletedAt: null })).toBe(false);
    expect(isTombstoned({ deletedAt: undefined })).toBe(false);
  });

  it('treats a finite deletedAt as tombstoned', () => {
    expect(isTombstoned({ deletedAt: 1 })).toBe(true);
    expect(isTombstoned({ deletedAt: Number.NaN })).toBe(false);
  });

  it('normalizes active, dying, and skeleton presentation stages', () => {
    const now = 1_700_000_000_000;
    expect(chainTombstoneState({}, now)).toBe('active');
    expect(
      chainTombstoneState({ deletedAt: now, purgeAfter: now + 1 }, now),
    ).toBe('dying');
    expect(
      chainTombstoneState({ deletedAt: now, purgeAfter: now }, now),
    ).toBe('skeleton');
    expect(chainTombstoneState({ deletedAt: now, purgeAfter: null }, now)).toBe(
      'skeleton',
    );
  });
});
