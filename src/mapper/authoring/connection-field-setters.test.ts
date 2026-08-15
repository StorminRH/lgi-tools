import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import {
  connectionFieldSetters,
  type ConnectionFieldAuthoringApi,
} from './connection-field-setters';

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
  toSignatureId: null,
  fromDestinationHint: null,
  toDestinationHint: null,
  destinationProvenance: null,
  pendingCandidates: null,
    pendingResolutionCharacterId: null,
  observedMassKg: null,
  observedMassAtStateKg: null,
};

function authoring(): ConnectionFieldAuthoringApi {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    linkStubToResolvedConnection: vi.fn(),
  };
}

describe('connectionFieldSetters', () => {
  it('routes the editor field body to the existing connection mutations', () => {
    const api = authoring();
    const setters = connectionFieldSetters('map-a', CONNECTION, api);

    setters.setWormholeType('B274');
    setters.setLifeStage('under_4_hours');
    setters.setShipSize('L');
    setters.setMassState('critical');

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
    expect(api.setConnectionShipSize).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION.connectionId,
      value: 'L',
    });
    expect(api.setConnectionMassState).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION.connectionId,
      value: 'critical',
    });
  });

  it('sends the one Leads-to hint from the editor origin side', () => {
    const api = authoring();
    connectionFieldSetters('map-a', CONNECTION, api).setLeadsTo('dangerous');
    expect(api.setConnectionDestinationHint).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION.connectionId,
      side: 'from',
      value: 'dangerous',
    });
  });

  it('sends a Leads-to origin pick as an explicit stub link', () => {
    const api = authoring();
    connectionFieldSetters('map-a', CONNECTION, api).linkToOrigin('resolved-1');
    expect(api.linkStubToResolvedConnection).toHaveBeenCalledWith({
      mapId: 'map-a',
      stubConnectionId: CONNECTION.connectionId,
      resolvedConnectionId: 'resolved-1',
    });
  });

  it('lets a host override the type dispatch without touching the other fields', () => {
    const api = authoring();
    const typed = vi.fn();
    const setters = connectionFieldSetters('map-a', CONNECTION, api, typed);
    setters.setWormholeType('K162');
    expect(typed).toHaveBeenCalledWith('K162');
    expect(api.setConnectionWormholeType).not.toHaveBeenCalled();
  });
});
