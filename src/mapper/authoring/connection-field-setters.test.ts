import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { blankDoor } from '@/data/maps/connection-hallway';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import {
  connectionFieldSetters,
  type ConnectionFieldAuthoringApi,
} from './connection-field-setters';

const CONNECTION = connectionEditorFixture({
  connectionId: 'connection-1' as Id<'mapConnections'>,
  firstSeenAt: 1,
  from: { ...blankDoor(), signatureId: 'ABC-123', signalPct: 100 },
});

function authoring(): ConnectionFieldAuthoringApi {
  return {
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    setConnectionDestination: vi.fn(),
    linkStubToResolvedConnection: vi.fn(),
  };
}

it('routes editor fields to connection mutations, including door-specific type/hint/destination and host type override', () => {
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
    side: 'from',
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

  setters.setLeadsTo('dangerous');
  expect(api.setConnectionDestinationHint).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION.connectionId,
    side: 'from',
    value: 'dangerous',
  });

  setters.setDestination(31_000_002);
  expect(api.setConnectionDestination).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION.connectionId,
    side: 'from',
    value: 31_000_002,
  });

  connectionFieldSetters(
    'map-a',
    CONNECTION,
    api,
    undefined,
    'to',
  ).setWormholeType('C247');
  expect(api.setConnectionWormholeType).toHaveBeenCalledWith({
    mapId: 'map-a',
    connection: CONNECTION,
    value: 'C247',
    side: 'to',
  });

  connectionFieldSetters(
    'map-a',
    CONNECTION,
    api,
    undefined,
    'to',
  ).setLeadsTo('hisec');
  expect(api.setConnectionDestinationHint).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION.connectionId,
    side: 'to',
    value: 'hisec',
  });

  connectionFieldSetters(
    'map-a',
    CONNECTION,
    api,
    undefined,
    'to',
  ).setDestination(null);
  expect(api.setConnectionDestination).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION.connectionId,
    side: 'to',
    value: null,
  });

  setters.linkToOrigin('resolved-1');
  expect(api.linkStubToResolvedConnection).toHaveBeenCalledWith({
    mapId: 'map-a',
    stubConnectionId: CONNECTION.connectionId,
    resolvedConnectionId: 'resolved-1',
  });

  const typed = vi.fn();
  const overrideApi = authoring();
  connectionFieldSetters('map-a', CONNECTION, overrideApi, typed).setWormholeType(
    'K162',
  );
  expect(typed).toHaveBeenCalledWith('K162');
  expect(overrideApi.setConnectionWormholeType).not.toHaveBeenCalled();
});
