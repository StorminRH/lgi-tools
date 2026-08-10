'use client';

// The map's non-canvas authoring ledger. Connection editing and ambiguous-jump
// answers live together in the Signature Editor/scanner slice.
import { useCallback, useEffect, useState } from 'react';
import type { Doc, Id } from '@/data/convex/data-model';
import type { ConnectionAuthoringApi } from '../signatures/connection-authoring-api';
import { MapEventLog } from '../log/MapEventLog';
import type { MapEventRestoreAction } from '../log/map-event-copy';

// Minute granularity matches the hour-scale countdown copy the overlay renders.
const OVERLAY_TICK_MS = 60_000;

/** Props for the map-local despawn ledger. */
export interface MapAuthoringOverlayProps {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionPresentationNow: number;
  readonly events: readonly Doc<'mapEvents'>[];
  readonly authoring: ConnectionAuthoringApi;
}

/** Owns the bottom-edge ledger and its restore dispatchers. */
export function MapAuthoringOverlay({
  mapId,
  canEdit,
  connectionPresentationNow,
  events,
  authoring,
}: MapAuthoringOverlayProps) {
  // The host clock ticks only while a connection is dying (at-rest canvas
  // work stays zero). Seed from the host clock so synthetic-clock renders
  // stay deterministic.
  const [tickNow, setTickNow] = useState(connectionPresentationNow);
  useEffect(() => {
    const timer = window.setInterval(
      () => setTickNow(Date.now()),
      OVERLAY_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const now = Math.max(tickNow, connectionPresentationNow);

  // Ledger Restore routes by payload: branch undo for collapse events,
  // signature restore for list/stub removal events.
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
