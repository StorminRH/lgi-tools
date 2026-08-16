// The map's connection mutation seam and the dispatchers that announce its
// outcomes. Split out of the retired edge-anchored card so the Signature
// Editor, the canvas edge menu, and the ledger all reach one owner.
import { toast } from '@/components/ui/toast';
import type { Id } from '@/data/convex/data-model';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import type { ConnectionDetail } from '../chain/use-map-chain';
import { postJumpRequest } from '../jump-client';
import type { ConnectionFieldAuthoringApi } from '../authoring/connection-field-setters';
import { announceSeverOutcome } from '../authoring/sever-toast';
import { announceSignatureRemoval } from './signature-toast';

/** Full authoring surface: shared fields plus connection lifecycle. */
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

/** Sends one confirm (null target) or correct answer for a pending auto-link. */
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

/**
 * Answers a prompt and dismisses it only when the route delivered the answer.
 * A lost race or transport failure keeps the prompt and says so — a silently
 * swallowed correction would leave the user believing their override was
 * recorded.
 */
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

/**
 * Applies a manual type entry, then notifies the jump route on every HELD
 * mutation — a set emits at human tier, and a clear lets the server remove a
 * now-superseded observation under the preserved dedupe key. Only a refused
 * mutation (undefined result) skips the notification; the emit-or-delete
 * decision itself remains server-gated. Exported for focused proof of the
 * notify condition.
 */
export async function applyWormholeType(input: {
  readonly mapId: string;
  readonly connection: ConnectionDetail;
  readonly value: string | null;
  readonly authoring: ConnectionAuthoringApi;
}): Promise<void> {
  const result = await input.authoring.setConnectionWormholeType({
    mapId: input.mapId,
    connection: input.connection,
    value: input.value,
  });
  if (result === undefined) return;
  await postJumpRequest({
    kind: 'typed-hole',
    mapId: input.mapId,
    connectionId: input.connection.connectionId,
  });
}

/** Delete and Restore for one connection, already bound to their undo pathway. */
export interface ConnectionLifecycleActions {
  readonly remove: () => void;
  readonly restore: () => void;
}

/**
 * The one place a UI surface gets connection destruction from.
 *
 * The editor's Delete and the edge menu's Delete are the same act for resolved
 * lines (sever + branch restore undo). Unresolved scanned stubs have no branch
 * to collapse — Delete tombstones them through removeSignatures, the same path
 * paste confirmation and the ceiling sweep use, so a restored expired stub can
 * actually leave the scanner again.
 */
export function connectionLifecycleActions(input: {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly authoring: ConnectionAuthoringApi;
  /** Runs after a held removal or a restore — typically closing the editor. */
  readonly onDone: () => void;
  /**
   * When set, Delete tombstones this unresolved stub via removeSignatures
   * instead of severConnection (which refuses null destinations).
   */
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

/** Tombstones one unresolved stub and offers the signature-restore undo. */
export async function removeStubAndAnnounce(input: {
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

/** Announces one sever outcome; exported for focused proof of the toast path. */
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
