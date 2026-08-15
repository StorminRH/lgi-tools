import type { Id } from '@/data/convex/data-model';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import type { ConnectionFieldSetters } from './connection-fields';

/** Existing connection mutation surface shared by every connection-field host. */
export interface ConnectionFieldAuthoringApi {
  readonly setConnectionWormholeType: (args: {
    mapId: string;
    connection: ConnectionEditorDetail;
    value: string | null;
  }) => Promise<unknown>;
  readonly setConnectionShipSize: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: ConnectionEditorDetail['shipSize'];
  }) => Promise<unknown>;
  readonly setConnectionMassState: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: ConnectionEditorDetail['massState'];
  }) => Promise<unknown>;
  readonly setConnectionDestinationHint: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    side: 'from' | 'to';
    value: WormholeDestinationHint | null;
  }) => Promise<unknown>;
  readonly setConnectionDestination: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    toSystemId: number | null;
  }) => Promise<unknown>;
  readonly setConnectionLifeStage: (args: {
    mapId: string;
    connection: ConnectionEditorDetail;
    value: ConnectionEditorDetail['lifeStage'];
  }) => Promise<unknown>;
  readonly linkStubToResolvedConnection: (args: {
    mapId: string;
    stubConnectionId: Id<'mapConnections'>;
    resolvedConnectionId: Id<'mapConnections'>;
  }) => Promise<unknown>;
}

/** Binds the shipped connection field body to one existing connection row. */
export function connectionFieldSetters(
  mapId: string,
  connection: ConnectionEditorDetail,
  authoring: ConnectionFieldAuthoringApi,
  setWormholeType = (value: string | null) => {
    void authoring.setConnectionWormholeType({ mapId, connection, value });
  },
): ConnectionFieldSetters {
  const connectionId = connection.connectionId;
  return {
    setWormholeType,
    setShipSize: (value) => {
      void authoring.setConnectionShipSize({ mapId, connectionId, value });
    },
    setMassState: (value) => {
      void authoring.setConnectionMassState({ mapId, connectionId, value });
    },
    setLifeStage: (value) => {
      void authoring.setConnectionLifeStage({ mapId, connection, value });
    },
    // One "Leads to" field (ruling D-G): the editor always speaks from the
    // origin endpoint it was opened on, so the side is decided here rather
    // than surfaced as a second control.
    setLeadsTo: (value) => {
      void authoring.setConnectionDestinationHint({
        mapId,
        connectionId,
        side: 'from',
        value,
      });
    },
    setDestination: (toSystemId) => {
      void authoring.setConnectionDestination({
        mapId,
        connectionId,
        toSystemId,
      });
    },
    linkToOrigin: (resolvedConnectionId) => {
      void authoring.linkStubToResolvedConnection({
        mapId,
        stubConnectionId: connectionId,
        resolvedConnectionId: resolvedConnectionId as Id<'mapConnections'>,
      });
    },
  };
}
