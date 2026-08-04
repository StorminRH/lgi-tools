'use client';

import { useCallback, useEffect } from 'react';
import type { Doc, Id } from '@/data/convex/data-model';
import type { ConnectionDetail } from '../chain/use-map-chain';
import { MapEventLog } from '../log/MapEventLog';
import { ConnectionDetailsCard } from './ConnectionDetailsCard';
import type { ConnectionFieldSetters } from './connection-fields';
import {
  connectionCardSelection,
  shouldClearConnectionSelection,
} from './connection-selection';
import { announceSeverOutcome } from './sever-toast';

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
  readonly connectionPresentationNow: number;
  readonly events: readonly Doc<'mapEvents'>[];
  readonly authoring: ConnectionAuthoringApi;
  readonly selectedConnectionId: Id<'mapConnections'> | null;
  readonly onSelectedConnectionIdChange: (
    connectionId: Id<'mapConnections'> | null,
  ) => void;
}

/**
 * Owns the edge-anchored card, sever toast, and bottom-edge ledger so the chain
 * host stays a thin subscription/layout shell.
 */
export function ConnectionAuthoringOverlay({
  mapId,
  canEdit,
  connectionDetails,
  connectionPresentationNow,
  events,
  authoring,
  selectedConnectionId,
  onSelectedConnectionIdChange,
}: ConnectionAuthoringOverlayProps) {
  const restoreSeveredBranch = useCallback(
    (connectionId: string) => {
      void authoring.restoreSeveredBranch({
        mapId,
        connectionId: connectionId as Id<'mapConnections'>,
      });
    },
    [authoring, mapId],
  );

  const selected =
    selectedConnectionId === null
      ? null
      : (connectionDetails.get(selectedConnectionId) ?? null);

  useEffect(() => {
    if (
      selectedConnectionId !== null &&
      shouldClearConnectionSelection(selected, connectionPresentationNow)
    ) {
      onSelectedConnectionIdChange(null);
    }
  }, [
    selectedConnectionId,
    selected,
    connectionPresentationNow,
    onSelectedConnectionIdChange,
  ]);

  const card = connectionCardSelection(selected, connectionPresentationNow);

  return (
    <>
      <MapEventLog
        events={events}
        canEdit={canEdit}
        now={connectionPresentationNow}
        onRestore={restoreSeveredBranch}
      />
      {canEdit && card !== null ? (
        <SelectedConnectionCard
          mapId={mapId}
          selection={card}
          now={connectionPresentationNow}
          authoring={authoring}
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
  onClose,
  onUndoBranch,
}: {
  readonly mapId: string;
  readonly selection: NonNullable<
    ReturnType<typeof connectionCardSelection>
  >;
  readonly now: number;
  readonly authoring: ConnectionAuthoringApi;
  readonly onClose: () => void;
  readonly onUndoBranch: (connectionId: string) => void;
}) {
  const { connection, mode } = selection;
  return (
    <ConnectionDetailsCard
      connection={connection}
      now={now}
      mode={mode}
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
      void authoring.setConnectionWormholeType({ mapId, connection, value });
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
  };
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
