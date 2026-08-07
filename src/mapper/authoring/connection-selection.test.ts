import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  connectionCardSelection,
  shouldClearConnectionSelection,
} from './connection-selection';

const NOW = 10_000;
const UNDO_MS = 24 * 60 * 60 * 1000;

function detail(partial: Partial<ConnectionDetail> = {}): ConnectionDetail {
  return {
    connectionId: 'c1' as Id<'mapConnections'>,
    _creationTime: 1,
    fromSystemId: 1,
    toSystemId: 2,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deathEarliestAt: null,
    deathLatestAt: null,
    deletedAt: null,
    purgeAfter: null,
    fromSignatureId: null,
    fromDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
    ...partial,
  };
}

describe('connectionCardSelection', () => {
  it('returns edit or restore for live and dying rows, and clears missing or skeleton selections', () => {
    expect(connectionCardSelection(detail(), NOW)).toEqual({
      connection: detail(),
      mode: 'edit',
    });
    const dying = detail({
      deletedAt: NOW - 1,
      purgeAfter: NOW + UNDO_MS,
    });
    expect(connectionCardSelection(dying, NOW)).toEqual({
      connection: dying,
      mode: 'restore',
    });

    expect(connectionCardSelection(null, NOW)).toBeNull();
    expect(connectionCardSelection(undefined, NOW)).toBeNull();
    const skeleton = detail({ deletedAt: NOW - 1, purgeAfter: null });
    expect(connectionCardSelection(skeleton, NOW)).toBeNull();
    expect(shouldClearConnectionSelection(skeleton, NOW)).toBe(true);
    expect(shouldClearConnectionSelection(detail(), NOW)).toBe(false);
  });
});
