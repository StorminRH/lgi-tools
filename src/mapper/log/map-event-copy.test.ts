import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import {
  mapEventConnectionId,
  mapEventLabel,
  mapEventRestorable,
  type MapEventRow,
} from './map-event-copy';

function event(
  partial: Pick<MapEventRow, 'kind' | 'payload' | 'at'> &
    Partial<Pick<MapEventRow, 'actor'>>,
): MapEventRow {
  return {
    _id: 'e1' as Id<'mapEvents'>,
    _creationTime: partial.at,
    mapId: 'map-a',
    actor: partial.actor ?? 'Pilot',
    purgeAfter: partial.at + 7 * 24 * 60 * 60 * 1000,
    ...partial,
  };
}

describe('map event copy', () => {
  it('labels each basic despawn-ledger kind', () => {
    expect(
      mapEventLabel(
        event({
          kind: 'connection_severed_retained',
          at: 1,
          payload: { connectionId: 'c1' },
        }),
      ),
    ).toBe('Severed connection — branch kept');
    expect(
      mapEventLabel(
        event({
          kind: 'branch_removed',
          at: 1,
          payload: { connectionId: 'c1', systemIds: [1] },
        }),
      ),
    ).toBe('Removed 1 downstream system');
    expect(
      mapEventLabel(
        event({
          kind: 'branch_removed',
          at: 1,
          payload: { connectionId: 'c1', systemIds: [1, 2] },
        }),
      ),
    ).toBe('Removed 2 downstream systems');
    expect(
      mapEventLabel(
        event({
          kind: 'branch_restored',
          at: 1,
          payload: { connectionId: 'c1', systemIds: [1, 2] },
        }),
      ),
    ).toBe('Restored branch (2 systems)');
    expect(
      mapEventLabel(
        event({
          kind: 'connection_restored',
          at: 1,
          payload: { connectionId: 'c1' },
        }),
      ),
    ).toBe('Restored connection');
  });

  it('exposes Restore only for in-window removal/sever rows', () => {
    const now = 10_000;
    const removed = event({
      kind: 'branch_removed',
      at: now - 1_000,
      payload: { connectionId: 'c1', systemIds: [1] },
    });
    expect(mapEventRestorable(removed, now)).toBe(true);
    expect(mapEventConnectionId(removed)).toBe('c1');

    const expired = event({
      kind: 'branch_removed',
      at: now - MAP_CHAIN_UNDO_WINDOW_MS - 1,
      payload: { connectionId: 'c1', systemIds: [1] },
    });
    expect(mapEventRestorable(expired, now)).toBe(false);

    const restored = event({
      kind: 'branch_restored',
      at: now,
      payload: { connectionId: 'c1', systemIds: [1] },
    });
    expect(mapEventRestorable(restored, now)).toBe(false);
  });
});
