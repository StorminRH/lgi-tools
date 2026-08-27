import type { Id } from '@/data/convex/data-model';
import type {
  ConnectionMassState,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import type { ConnectionFieldSetters } from './connection-fields';

/** Existing connection mutation surface shared by every connection-field host. */
export interface ConnectionFieldAuthoringApi {
  readonly setConnectionWormholeType: (args: {
    mapId: string;
    connection: ConnectionEditorDetail;
    value: string | null;
    side?: 'from' | 'to';
  }) => Promise<unknown>;
  readonly setConnectionShipSize: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: WormholeSizeClass | null;
  }) => Promise<unknown>;
  readonly setConnectionMassState: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: ConnectionMassState | null;
  }) => Promise<unknown>;
  readonly setConnectionDestinationHint: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    side: 'from' | 'to';
    value: WormholeDestinationHint | null;
  }) => Promise<unknown>;
  /** Writes one door's Leads-to system note, or `null` to clear that note. */
  readonly setConnectionDestination: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    side: 'from' | 'to';
    value: number | null;
  }) => Promise<unknown>;
  readonly setConnectionLifeStage: (args: {
    mapId: string;
    connection: ConnectionEditorDetail;
    value: WormholeLifeStage | null;
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
    void authoring.setConnectionWormholeType({ mapId, connection, value, side });
  },
  side: 'from' | 'to' = 'from',
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
    // One "Leads to" field (ruling D-G): the control speaks from the mouth
    // it was opened on. The popup editor always passes the `from` end (the
    // system whose scanner you opened).
    setLeadsTo: (value) => {
      void authoring.setConnectionDestinationHint({
        mapId,
        connectionId,
        side,
        value,
      });
    },
    setDestination: (toSystemId) => {
      void authoring.setConnectionDestination({
        mapId,
        connectionId,
        side,
        value: toSystemId,
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
