import { toast } from '@/components/ui/toast';
import type { Id } from '@/data/convex/data-model';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import type { ConnectionDoorSide } from '@/data/maps/connection-hallway';
import { followUpTypeSetterTypedHole } from './type-setter-follow-up';
import type {
  ConnectionDetail,
  ConnectionEditorDetail,
} from '../chain/connection-detail';
import {
  connectionFieldSetters,
  type ConnectionFieldAuthoringApi,
} from '../authoring/connection-field-setters';
import { postJumpRequest } from '../jump-client';
import { announceSeverOutcome } from '../authoring/sever-toast';
import {
  removeSignaturesWithUndo,
  type SignatureSelectionMutations,
} from './signature-removal';

export interface ConnectionAuthoringApi
  extends ConnectionFieldAuthoringApi, SignatureSelectionMutations {
  readonly severConnection: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
  }) => Promise<
    | { outcome: 'retained' }
    | { outcome: 'already_applied' }
    | { outcome: 'removed'; systemIds: number[] }
    | undefined
  >;
  readonly restoreSeveredBranch: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
  }) => Promise<unknown>;
  readonly restoreConnection: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
  }) => Promise<unknown>;
}

export function answerJumpResolution(input: {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly targetConnectionId: string | null;
}): Promise<JumpResolverResponse | null> {
  return postJumpRequest({
    kind: 'confirm',
    mapId: input.mapId,
    connectionId: input.connectionId,
    targetConnectionId: input.targetConnectionId,
  });
}

export async function answerAndAnnounce(input: {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly targetConnectionId: string | null;
  readonly dismiss: () => void;
}): Promise<void> {
  const response = await answerJumpResolution(input);
  if (response !== null && response.status !== 'retry') {
    input.dismiss();
    return;
  }
  toast.error('Answer not saved', {
    id: `jump-answer:${input.connectionId}`,
    duration: 5_000,
  });
}

function isResolvedConnection(
  connection: ConnectionEditorDetail,
): connection is ConnectionDetail {
  return connection.toSystemId !== null;
}

export function bindConnectionSetters(
  mapId: string,
  authoring: ConnectionAuthoringApi,
) {
  return (
    connection: ConnectionEditorDetail,
    side: ConnectionDoorSide = 'from',
  ) =>
    connectionFieldSetters(
      mapId,
      connection,
      authoring,
      (value) => {
        if (isResolvedConnection(connection)) {
          void applyWormholeType({
            mapId,
            connection,
            value,
            side,
            authoring,
          });
          return;
        }
        void authoring.setConnectionWormholeType({
          mapId,
          connection,
          value,
          side,
        });
      },
      side,
    );
}

export async function applyWormholeType(input: {
  readonly mapId: string;
  readonly connection: ConnectionDetail;
  readonly value: string | null;
  readonly side?: ConnectionDoorSide;
  readonly authoring: ConnectionAuthoringApi;
}): Promise<void> {
  const result = await input.authoring.setConnectionWormholeType({
    mapId: input.mapId,
    connection: input.connection,
    value: input.value,
    side: input.side,
  });
  await followUpTypeSetterTypedHole({
    mapId: input.mapId,
    connectionId: input.connection.connectionId,
    write: result,
  });
}

export interface ConnectionLifecycleActions {
  readonly remove: () => void;
  readonly restore: () => void;
}

export function connectionLifecycleActions(input: {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly authoring: ConnectionAuthoringApi;
  readonly onDone: () => void;
  readonly stub?: {
    readonly systemId: number;
    readonly signatureId: string;
  } | null;
}): ConnectionLifecycleActions {
  return {
    remove: () => {
      if (input.stub != null) {
        void removeSignaturesWithUndo({
          mapId: input.mapId,
          systemId: input.stub.systemId,
          signatureIds: [input.stub.signatureId],
          mutations: input.authoring,
          onRemoved: input.onDone,
        });
        return;
      }
      void severAndAnnounce({
        mapId: input.mapId,
        connectionId: input.connectionId,
        authoring: input.authoring,
        onDone: input.onDone,
        onUndo: () => {
          void input.authoring.restoreSeveredBranch({
            mapId: input.mapId,
            connectionId: input.connectionId,
          });
        },
      });
    },
    restore: () => {
      void input.authoring.restoreConnection({
        mapId: input.mapId,
        connectionId: input.connectionId,
      });
      input.onDone();
    },
  };
}

export async function severAndAnnounce(input: {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly authoring: ConnectionAuthoringApi;
  readonly onDone: () => void;
  readonly onUndo: () => void;
}): Promise<void> {
  const result = await input.authoring.severConnection({
    mapId: input.mapId,
    connectionId: input.connectionId,
  });
  if (result === undefined) return;
  input.onDone();
  announceSeverOutcome({
    connectionId: input.connectionId,
    result,
    onUndo: input.onUndo,
  });
}
