import { describe, expect, it } from 'vitest';
import { MAP_EVENT_KINDS, MAP_EVENT_RETENTION_MS } from './chain-events';

describe('chain events', () => {
  it('owns the basic despawn-ledger vocabulary and seven-day retention', () => {
    expect(MAP_EVENT_KINDS).toEqual([
      'connection_severed_retained',
      'branch_removed',
      'branch_restored',
      'connection_restored',
    ]);
    expect(MAP_EVENT_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
