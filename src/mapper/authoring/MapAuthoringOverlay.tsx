'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Doc, Id } from '@/data/convex/data-model';
import type { ConnectionAuthoringApi } from '../signatures/connection-authoring-api';
import { MapEventLog } from '../log/MapEventLog';
import type { MapEventRestoreAction } from '../log/map-event-copy';

const OVERLAY_TICK_MS = 60_000;

export interface MapAuthoringOverlayProps {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionPresentationNow: number;
  readonly events: readonly Doc<'mapEvents'>[];
  readonly authoring: ConnectionAuthoringApi;
}

export function MapAuthoringOverlay({
  mapId,
  canEdit,
  connectionPresentationNow,
  events,
  authoring,
}: MapAuthoringOverlayProps) {

  const [tickNow, setTickNow] = useState(connectionPresentationNow);
  useEffect(() => {
    const timer = window.setInterval(
      () => setTickNow(Date.now()),
      OVERLAY_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const now = Math.max(tickNow, connectionPresentationNow);

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
      events={events}
      canEdit={canEdit}
      now={now}
      onRestore={restoreFromEvent}
    />
  );
}
