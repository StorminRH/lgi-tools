'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Doc, Id } from '@/data/convex/data-model';
import type { JumpResolverResponse } from '@/data/maps/api-contract';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { postJumpRequest } from '../jump-client';
import { MapEventLog } from '../log/MapEventLog';
import { ConnectionDetailsCard } from './ConnectionDetailsCard';
import type {
  ConnectionFieldSetters,
  ConnectionResolutionControls,
} from './connection-fields';
import {
  connectionCardSelection,
  shouldClearConnectionSelection,
} from './connection-selection';
import {
  hasPendingResolution,
  jumpResolutionCandidates,
  pendingJumpResolution,
} from './jump-resolution';
import {
  JumpResolutionPrompt,
  type JumpResolutionAnswers,
} from './JumpResolutionPrompt';
import { announceSeverOutcome } from './sever-toast';
import { toast } from '@/components/ui/toast';

// Minute granularity matches the hour-scale countdown copy the overlay renders.
const OVERLAY_TICK_MS = 60_000;

/** Authoring mutation surface the overlay needs for connection intelligence. */
export interface ConnectionAuthoringApi {
  readonly setConnectionWormholeType: (args: {
    mapId: string;
    connection: ConnectionDetail;
    value: string | null;
  }) => Promise<unknown>;
  readonly setConnectionShipSize: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: ConnectionDetail['shipSize'];
  }) => Promise<unknown>;
  readonly setConnectionMassState: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    value: ConnectionDetail['massState'];
  }) => Promise<unknown>;
  readonly setConnectionDestinationHint: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
    side: 'from' | 'to';
    value: WormholeDestinationHint | null;
  }) => Promise<unknown>;
  readonly setConnectionLifeStage: (args: {
    mapId: string;
    connection: ConnectionDetail;
    value: ConnectionDetail['lifeStage'];
  }) => Promise<unknown>;
  readonly severConnection: (args: {
    mapId: string;
    connectionId: Id<'mapConnections'>;
  }) => Promise<
    | { outcome: 'retained' }
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

/** Props for the map-local connection card + despawn ledger overlay. */
export interface ConnectionAuthoringOverlayProps {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly connectionPresentationNow: number;
  readonly events: readonly Doc<'mapEvents'>[];
  readonly authoring: ConnectionAuthoringApi;
  readonly selectedConnectionId: Id<'mapConnections'> | null;
  readonly onSelectedConnectionIdChange: (
    connectionId: Id<'mapConnections'> | null,
  ) => void;
}

const EMPTY_DISMISSED: ReadonlySet<string> = new Set();

/**
 * Owns the edge-anchored card, sever toast, and bottom-edge ledger so the chain
 * host stays a thin subscription/layout shell.
 */
export function ConnectionAuthoringOverlay({
  mapId,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  connectionPresentationNow,
  events,
  authoring,
  selectedConnectionId,
  onSelectedConnectionIdChange,
}: ConnectionAuthoringOverlayProps) {
  // The host clock ticks only while a connection is dying (at-rest canvas
  // work stays zero). The overlay owns its own minute tick so lifetime
  // countdowns and ledger restore windows keep moving while it is on screen.
  // Seeded from the host clock so a render under a synthetic clock stays on it.
  const [tickNow, setTickNow] = useState(connectionPresentationNow);
  useEffect(() => {
    const timer = window.setInterval(
      () => setTickNow(Date.now()),
      OVERLAY_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const now = Math.max(tickNow, connectionPresentationNow);

  const restoreSeveredBranch = useCallback(
    (connectionId: string) => {
      void authoring.restoreSeveredBranch({
        mapId,
        connectionId: connectionId as Id<'mapConnections'>,
      });
    },
    [authoring, mapId],
  );

  // Locally dismissed pending resolutions: the assumed association stands and
  // the connection card keeps the same choices answerable later.
  const [dismissedResolutions, setDismissedResolutions] =
    useState<ReadonlySet<string>>(EMPTY_DISMISSED);
  const dismissResolution = useCallback((connectionId: string) => {
    setDismissedResolutions((previous) => new Set(previous).add(connectionId));
  }, []);
  const answersFor = useCallback(
    (connectionId: Id<'mapConnections'>): JumpResolutionAnswers => ({
      onConfirm: () => {
        void answerAndAnnounce({
          mapId,
          connectionId,
          targetConnectionId: null,
          dismiss: () => dismissResolution(connectionId),
        });
      },
      onCorrect: (targetConnectionId) => {
        void answerAndAnnounce({
          mapId,
          connectionId,
          targetConnectionId,
          dismiss: () => dismissResolution(connectionId),
        });
      },
    }),
    [mapId, dismissResolution],
  );

  const selected =
    selectedConnectionId === null
      ? null
      : (connectionDetails.get(selectedConnectionId) ?? null);

  useEffect(() => {
    if (
      selectedConnectionId !== null &&
      shouldClearConnectionSelection(selected, now)
    ) {
      onSelectedConnectionIdChange(null);
    }
  }, [selectedConnectionId, selected, now, onSelectedConnectionIdChange]);

  const card = connectionCardSelection(selected, now);
  const promptResolution = canEdit
    ? pendingJumpResolution(connectionDetails, unresolvedHoles, dismissedResolutions)
    : null;

  return (
    <>
      <MapEventLog
        events={events}
        canEdit={canEdit}
        now={now}
        onRestore={restoreSeveredBranch}
      />
      {promptResolution !== null ? (
        <JumpResolutionPrompt
          resolution={promptResolution}
          answers={answersFor(promptResolution.connectionId)}
          onDismiss={() => dismissResolution(promptResolution.connectionId)}
        />
      ) : null}
      {canEdit && card !== null ? (
        <SelectedConnectionCard
          mapId={mapId}
          selection={card}
          now={now}
          authoring={authoring}
          resolutionControls={
            hasPendingResolution(card.connection)
              ? {
                  resolution: {
                    connectionId: card.connection.connectionId,
                    candidates: jumpResolutionCandidates(
                      card.connection,
                      unresolvedHoles,
                    ),
                  },
                  answers: answersFor(card.connection.connectionId),
                }
              : undefined
          }
          onClose={() => onSelectedConnectionIdChange(null)}
          onUndoBranch={restoreSeveredBranch}
        />
      ) : null}
    </>
  );
}

function SelectedConnectionCard({
  mapId,
  selection,
  now,
  authoring,
  resolutionControls,
  onClose,
  onUndoBranch,
}: {
  readonly mapId: string;
  readonly selection: NonNullable<
    ReturnType<typeof connectionCardSelection>
  >;
  readonly now: number;
  readonly authoring: ConnectionAuthoringApi;
  readonly resolutionControls?: ConnectionResolutionControls;
  readonly onClose: () => void;
  readonly onUndoBranch: (connectionId: string) => void;
}) {
  const { connection, mode } = selection;
  return (
    <ConnectionDetailsCard
      connection={connection}
      now={now}
      mode={mode}
      resolutionControls={resolutionControls}
      onClose={onClose}
      onSever={() => {
        void severAndAnnounce({
          mapId,
          connectionId: connection.connectionId,
          authoring,
          onDone: onClose,
          onUndo: () => onUndoBranch(connection.connectionId),
        });
      }}
      onRestore={() => {
        void authoring.restoreConnection({
          mapId,
          connectionId: connection.connectionId,
        });
        onClose();
      }}
      setters={fieldSetters(mapId, connection, authoring)}
    />
  );
}

function fieldSetters(
  mapId: string,
  connection: ConnectionDetail,
  authoring: ConnectionAuthoringApi,
): ConnectionFieldSetters {
  return {
    setWormholeType: (value) => {
      void applyWormholeType({ mapId, connection, value, authoring });
    },
    setShipSize: (value) => {
      void authoring.setConnectionShipSize({
        mapId,
        connectionId: connection.connectionId,
        value,
      });
    },
    setMassState: (value) => {
      void authoring.setConnectionMassState({
        mapId,
        connectionId: connection.connectionId,
        value,
      });
    },
    setLifeStage: (value) => {
      void authoring.setConnectionLifeStage({ mapId, connection, value });
    },
    setDestinationHint: (value) => {
      // The card records what its own side's show-info says about the space
      // beyond the hole, so manual hints always land on the origin side.
      void authoring.setConnectionDestinationHint({
        mapId,
        connectionId: connection.connectionId,
        side: 'from',
        value,
      });
    },
  };
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
 * A lost race or transport failure keeps the prompt (still answerable from
 * the connection card) and says so — a silently swallowed correction would
 * leave the user believing their override was recorded.
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
 * Applies a manual type entry, then notifies the jump route so the typed
 * identity emits at human tier. A refused mutation (undefined result) and a
 * cleared code both skip the notification; the emission itself remains
 * server-gated. Exported for focused proof of the notify condition.
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
  if (result === undefined || input.value === null) return;
  await postJumpRequest({
    kind: 'typed-hole',
    mapId: input.mapId,
    connectionId: input.connection.connectionId,
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
