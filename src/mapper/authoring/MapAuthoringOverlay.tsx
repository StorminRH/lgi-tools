'use client';

// The map's non-canvas authoring chrome: the bottom-edge despawn ledger plus
// the floating auto-link prompt.
//
// The edge-anchored connection card that used to live here is retired (ruling
// D-F) — one Signature Editor now owns every connection edit. The floating
// jump prompt is deliberately still hosted here: OW-7 replaces it with the
// scanner-overlay prompt (ruling D-H) and this file loses its second job then.
import { useCallback, useEffect, useState } from 'react';
import type { Doc, Id } from '@/data/convex/data-model';
import type { ConnectionDetail, UnresolvedHoleSummary } from '../chain/use-map-chain';
import { MapEventLog } from '../log/MapEventLog';
import type { MapEventRestoreAction } from '../log/map-event-copy';
import type { ConnectionAuthoringApi } from './connection-authoring-api';
import { answerAndAnnounce } from './connection-authoring-api';
import { pendingJumpResolution } from './jump-resolution';
import {
  JumpResolutionPrompt,
  type JumpResolutionAnswers,
} from './JumpResolutionPrompt';

// Minute granularity matches the hour-scale countdown copy the overlay renders.
const OVERLAY_TICK_MS = 60_000;

/** Props for the map-local despawn ledger and auto-link prompt. */
export interface MapAuthoringOverlayProps {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly connectionPresentationNow: number;
  readonly events: readonly Doc<'mapEvents'>[];
  readonly authoring: ConnectionAuthoringApi;
}

const EMPTY_DISMISSED: ReadonlySet<string> = new Set();

/**
 * Owns the sever toast's undo path, the bottom-edge ledger, and the pending
 * auto-link prompt so the chain host stays a thin subscription/layout shell.
 */
export function MapAuthoringOverlay({
  mapId,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  connectionPresentationNow,
  events,
  authoring,
}: MapAuthoringOverlayProps) {
  // The host clock ticks only while a connection is dying (at-rest canvas
  // work stays zero). The overlay owns its own minute tick so ledger restore
  // windows keep moving while it is on screen. Seeded from the host clock so
  // a render under a synthetic clock stays on it.
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

  // Locally dismissed pending resolutions: the assumed association stands.
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

  const promptResolution = canEdit
    ? pendingJumpResolution(connectionDetails, unresolvedHoles, dismissedResolutions)
    : null;

  return (
    <>
      <MapEventLog
        events={events}
        canEdit={canEdit}
        now={now}
        onRestore={restoreFromEvent}
      />
      {promptResolution !== null ? (
        <JumpResolutionPrompt
          resolution={promptResolution}
          answers={answersFor(promptResolution.connectionId)}
          onDismiss={() => dismissResolution(promptResolution.connectionId)}
        />
      ) : null}
    </>
  );
}
