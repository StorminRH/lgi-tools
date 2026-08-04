import { describe, expect, it } from 'vitest';
import {
  chainTombstoneStamps,
  isTombstoned,
  MAP_CHAIN_UNDO_WINDOW_MS,
} from './chain-contract';

describe('chain-contract', () => {
  it('owns a 24-hour undo window', () => {
    expect(MAP_CHAIN_UNDO_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('pairs purgeAfter exactly one undo window after deletedAt', () => {
    const deletedAt = 1_700_000_000_000;
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
  });
});
