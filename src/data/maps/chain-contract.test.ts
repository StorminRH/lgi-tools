import { describe, expect, it } from 'vitest';
import {
  chainTombstoneState,
  chainTombstoneStamps,
  isTombstoned,
  MAP_CHAIN_UNDO_WINDOW_MS,
  tombstoneDeletedAt,
  tombstonePurgeAfter,
} from './chain-contract';
import { MAP_EVENT_RETENTION_MS } from './chain-events';

describe('chain-contract', () => {
  it('pairs purgeAfter one undo window after deletedAt and pins durability windows', () => {
    const deletedAt = 1_700_000_000_000;
    // Every purge suite computes with this constant symbolically, so a unit
    // typo (days → hours) would pass everywhere but here. Product durability
    // pins: 24h undo, 7d despawn ledger.
    expect(MAP_CHAIN_UNDO_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAP_EVENT_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(chainTombstoneStamps(deletedAt)).toEqual({
      deletedAt,
      purgeAfter: deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
    });
  });

  it('normalizes tombstone detection and presentation stages', () => {
    expect(isTombstoned(null)).toBe(false);
    expect(isTombstoned(undefined)).toBe(false);
    expect(tombstoneDeletedAt(null)).toBeNull();
    expect(tombstonePurgeAfter(null)).toBeNull();
    expect(isTombstoned({})).toBe(false);
    expect(isTombstoned({ deletedAt: null })).toBe(false);
    expect(isTombstoned({ deletedAt: undefined })).toBe(false);
    expect(isTombstoned({ deletedAt: 1 })).toBe(true);
    expect(isTombstoned({ deletedAt: Number.NaN })).toBe(false);

    const now = 1_700_000_000_000;
    expect(chainTombstoneState({}, now)).toBe('active');
    expect(chainTombstoneState({ deletedAt: now, purgeAfter: now + 1 }, now)).toBe('dying');
    expect(chainTombstoneState({ deletedAt: now, purgeAfter: now }, now)).toBe('skeleton');
    expect(chainTombstoneState({ deletedAt: now, purgeAfter: null }, now)).toBe('skeleton');
    expect(isTombstoned({ tombstone: { kind: 'live' } })).toBe(false);
    expect(
      isTombstoned({ tombstone: { kind: 'removed', deletedAt: 1, purgeAfter: 2 } }),
    ).toBe(true);
    expect(
      tombstonePurgeAfter({ tombstone: { kind: 'removed', deletedAt: 1, purgeAfter: 2 } }),
    ).toBe(2);
    expect(tombstonePurgeAfter({ tombstone: { kind: 'live' } })).toBeNull();
    expect(
      chainTombstoneState(
        { tombstone: { kind: 'removed', deletedAt: now, purgeAfter: now + 1 } },
        now,
      ),
    ).toBe('dying');
  });
});
