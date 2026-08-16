'use client';

// Resolves what the one Signature Editor is currently editing.
//
// The provider holds only a connection id; everything else — which live row it
// names, whether that row still admits an editor, the destination's identity
// readout, and the mutation seam — is derived here so the editor component
// stays presentation plus its drawn row tie.
import { useEffect } from 'react';
import type { Id } from '@/data/convex/data-model';
import {
  applyWormholeType,
  connectionLifecycleActions,
  type ConnectionAuthoringApi,
} from './connection-authoring-api';
import { connectionEditorMode } from '../authoring/connection-editor-mode';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import { originLeadOptions } from './origin-leads';
import {
  useUniverseAssets,
  type ConnectionDetail,
  type ConnectionEditorDetail,
  type UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { SignatureEditor } from './SignatureEditor';
import { destinationReadout } from './system-readout';

/** Whether the row has a resolved destination (the card-parity type path). */
function isResolvedConnection(
  connection: ConnectionEditorDetail,
): connection is ConnectionDetail {
  return connection.toSystemId !== null;
}

function editedConnection(
  connectionId: Id<'mapConnections'> | null,
  resolved: ReadonlyMap<string, ConnectionDetail>,
  unresolved: readonly UnresolvedHoleSummary[],
): ConnectionEditorDetail | null {
  if (connectionId === null) return null;
  return (
    resolved.get(connectionId)
    ?? unresolved.find((hole) => hole.connectionId === connectionId)
    ?? null
  );
}

/** Props for the live editor host. */
export interface ActiveSignatureEditorProps {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'> | null;
  /** Scanner row the leader should bracket; null falls back to fromSignatureId. */
  readonly anchorSignatureId?: string | null;
  readonly connectionDetails: ReadonlyMap<string, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly now: number;
  readonly onClose: () => void;
}

/** Mounts the editor for the currently edited connection, or nothing. */
export function ActiveSignatureEditor({
  mapId,
  connectionId,
  anchorSignatureId = null,
  connectionDetails,
  unresolvedHoles,
  authoring,
  now,
  onClose,
}: ActiveSignatureEditorProps) {
  const connection = editedConnection(
    connectionId,
    connectionDetails,
    unresolvedHoles,
  );
  const selection = connectionEditorMode(connection, now);
  const assets = useUniverseAssets();
  const systemInfo = assets === null ? null : (id: number) => assets.systemInfo(id);
  const destination = destinationReadout(connection?.toSystemId ?? null, systemInfo);
  const originLeads = originLeadOptions(
    connection,
    [...connectionDetails.values()],
    systemInfo,
  );

  // A row that tombstones past its undo window, or leaves the feed entirely,
  // closes the editor rather than freezing a stale copy of itself on screen.
  useEffect(() => {
    if (connectionId !== null && selection === null) onClose();
  }, [connectionId, selection, onClose]);

  if (selection === null) return null;
  return (
    <ActiveSignatureEditorView
      anchorSignatureId={anchorSignatureId}
      authoring={authoring}
      destination={destination}
      edited={selection.connection}
      mapId={mapId}
      mode={selection.mode}
      now={now}
      onClose={onClose}
      originLeads={originLeads}
    />
  );
}

function ActiveSignatureEditorView({
  anchorSignatureId,
  authoring,
  destination,
  edited,
  mapId,
  mode,
  now,
  onClose,
  originLeads,
}: {
  readonly anchorSignatureId: string | null;
  readonly authoring: ConnectionAuthoringApi;
  readonly destination: ReturnType<typeof destinationReadout>;
  readonly edited: ConnectionEditorDetail;
  readonly mapId: string;
  readonly mode: NonNullable<ReturnType<typeof connectionEditorMode>>['mode'];
  readonly now: number;
  readonly onClose: () => void;
  readonly originLeads: ReturnType<typeof originLeadOptions>;
}) {
  const lifecycle = connectionLifecycleActions({
    mapId,
    connectionId: edited.connectionId,
    authoring,
    onDone: onClose,
    stub:
      edited.toSystemId === null && edited.fromSignatureId !== null
        ? {
            systemId: edited.fromSystemId,
            signatureId: edited.fromSignatureId,
          }
        : null,
  });
  return (
    <SignatureEditor
      connection={edited}
      anchorSignatureId={anchorSignatureId}
      mode={mode}
      now={now}
      destination={destination}
      originLeads={originLeads}
      setters={connectionFieldSetters(mapId, edited, authoring, (value) => {
        // Parity with the retired connection card: type entry on a RESOLVED
        // row runs the same typed-hole notification (observation emit plus
        // superseded-row repair), so identical user intent cannot produce
        // divergent Neon state. A scanned unresolved stub needs no second
        // channel — its setter already cascades the elimination pass, which
        // logs that row's identity at its own tier and corrects the key in
        // place (ruling D-B).
        if (isResolvedConnection(edited)) {
          void applyWormholeType({ mapId, connection: edited, value, authoring });
          return;
        }
        void authoring.setConnectionWormholeType({
          mapId,
          connection: edited,
          value,
        });
      })}
      onDelete={lifecycle.remove}
      onRestore={lifecycle.restore}
      onClose={onClose}
    />
  );
}
