import { toast } from '@/components/ui/toast';
import type { Id } from '@/data/convex/data-model';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import type { ConnectionDetail } from '../chain/connection-detail';
import { postJumpRequest } from '../jump-client';
import type { ConnectionFieldAuthoringApi } from '../authoring/connection-field-setters';
import { announceSeverOutcome } from '../authoring/sever-toast';
import { announceSignatureRemoval } from './signature-toast';

export interface ConnectionAuthoringApi extends ConnectionFieldAuthoringApi {
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
  readonly removeSignatures: (args: {
    mapId: string;
    systemId: number;
    signatureIds: string[];
  }) => Promise<unknown>;
  readonly restoreSignatures: (args: {
    mapId: string;
    systemId: number;
    signatureIds: string[];
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
  toast.error('Signature answer not recorded — try again', {
    id: `jump-answer:${input.connectionId}`,
    duration: 5_000,
  });
}

export async function applyWormholeType(input: {
  readonly mapId: string;
  readonly connection: ConnectionDetail;
  readonly value: string | null;
  readonly side?: 'from' | 'to';
  readonly authoring: ConnectionAuthoringApi;
}): Promise<void> {
  const result = await input.authoring.setConnectionWormholeType({
    mapId: input.mapId,
    connection: input.connection,
    value: input.value,
    side: input.side,
  });
  if (result === undefined) return;
  await postJumpRequest({
    kind: 'typed-hole',
    mapId: input.mapId,
    connectionId: input.connection.connectionId,
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
        void removeStubAndAnnounce({
          mapId: input.mapId,
          systemId: input.stub.systemId,
          signatureId: input.stub.signatureId,
          authoring: input.authoring,
          onDone: input.onDone,
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

async function removeStubAndAnnounce(input: {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureId: string;
  readonly authoring: ConnectionAuthoringApi;
  readonly onDone: () => void;
}): Promise<void> {
  const result = await input.authoring.removeSignatures({
    mapId: input.mapId,
    systemId: input.systemId,
    signatureIds: [input.signatureId],
  });
  if (result === undefined) {
    toast.error('Signature could not be removed.', {
      id: `signature-remove:${input.systemId}:${input.signatureId}`,
    });
    return;
  }
  input.onDone();
  announceSignatureRemoval({
    systemId: input.systemId,
    signatureIds: [input.signatureId],
    onUndo: () => {
      void input.authoring
        .restoreSignatures({
          mapId: input.mapId,
          systemId: input.systemId,
          signatureIds: [input.signatureId],
        })
        .catch(() => {
          toast.error('Signature could not be restored.', {
            id: `signature-restore:${input.systemId}:${input.signatureId}`,
          });
        });
    },
  });
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
