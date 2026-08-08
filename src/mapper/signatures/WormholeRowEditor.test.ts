import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionAuthoringApi } from '../authoring/ConnectionAuthoringOverlay';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';

const CONNECTION: ConnectionEditorDetail = {
  connectionId: 'connection-1' as Id<'mapConnections'>,
  _creationTime: 1,
  fromSystemId: 31_000_001,
  toSystemId: null,
  fromSignalPct: 100,
  firstSeenAt: 1,
  wormholeTypeCode: null,
  typedSide: null,
  massState: null,
  shipSize: null,
  lifeStage: null,
  lifeStageObservedAt: null,
  deathEarliestAt: null,
  deathLatestAt: null,
  deletedAt: null,
  purgeAfter: null,
  fromSignatureId: 'ABC-123',
  fromDestinationHint: null,
  toDestinationHint: null,
  destinationProvenance: null,
  pendingCandidates: null,
  observedMassKg: null,
  observedMassAtStateKg: null,
};

function authoring(): ConnectionAuthoringApi {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    setConnectionTypedSide: vi.fn(),
    severConnection: vi.fn(),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
  };
}

describe('wormhole row editor', () => {
  it('routes the shared connection fields to the existing connection mutations', () => {
    const api = authoring();
    const setters = connectionFieldSetters('map-a', CONNECTION, api);

    setters.setWormholeType('B274');
    setters.setLifeStage('under_4_hours');
    setters.setTypedSide('to');
    setters.setDestinationHint('to', 'dangerous');

    expect(api.setConnectionWormholeType).toHaveBeenCalledWith({
      mapId: 'map-a',
      connection: CONNECTION,
      value: 'B274',
    });
    expect(api.setConnectionLifeStage).toHaveBeenCalledWith({
      mapId: 'map-a',
      connection: CONNECTION,
      value: 'under_4_hours',
    });
    expect(api.setConnectionTypedSide).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION.connectionId,
      value: 'to',
    });
    expect(api.setConnectionDestinationHint).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION.connectionId,
      side: 'to',
      value: 'dangerous',
    });
  });
});
