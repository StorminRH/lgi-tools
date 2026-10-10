'use client';

import { useCallback } from 'react';
import type { Id } from '@/data/convex/data-model';
import { useNow } from '@/lib/use-now';
import type { ConnectionAuthoringApi } from '../signatures/connection-authoring-api';
import { MapEventLog } from '../log/MapEventLog';
import type { MapEventRestoreAction } from '../log/map-event-copy';

const OVERLAY_TICK_MS = 60_000;

export interface MapAuthoringOverlayProps {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionPresentationNow: number;
  readonly authoring: ConnectionAuthoringApi;
}

export function MapAuthoringOverlay({
  mapId,
  canEdit,
  connectionPresentationNow,
  authoring,
}: MapAuthoringOverlayProps) {
  // A fresher tombstone tick from the chain still wins over this clock.
  const now = Math.max(useNow(OVERLAY_TICK_MS), connectionPresentationNow);

  const restoreFromEvent = useCallback(
    (action: MapEventRestoreAction) => {
      if (action.kind === 'signatures') {
        void authoring.restoreSignatures({
          mapId,
          systemId: action.systemId,
          signatureIds: [...action.signatureIds],
        });
        return;
      }
      void authoring.restoreSeveredBranch({
        mapId,
        connectionId: action.connectionId as Id<'mapConnections'>,
      });
    },
    [authoring, mapId],
  );

  return (
    <MapEventLog
      mapId={mapId}
      canEdit={canEdit}
      now={now}
      onRestore={restoreFromEvent}
    />
  );
}
