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
  systemIdentityReadout,
  type SystemIdentityReadout,
} from '@/data/eve-data/system-identity';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import {
  applyWormholeType,
  connectionLifecycleActions,
  type ConnectionAuthoringApi,
} from '../authoring/connection-authoring-api';
import { connectionEditorMode } from '../authoring/connection-editor-mode';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import { resolveSystemLabel } from '../chain/labels';
import {
  useUniverseAssets,
  type ConnectionDetail,
  type ConnectionEditorDetail,
  type UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { SignatureEditor } from './SignatureEditor';

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
  readonly connectionDetails: ReadonlyMap<string, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly now: number;
  readonly onClose: () => void;
  /** Focuses one system on the canvas from the locked Leads-to readout. */
  readonly onFocusSystem?: (systemId: number) => void;
}

/**
 * The destination identity readout, or null while the hole is unresolved.
 *
 * Pure and exported so the locked Leads-to answer is proved without a
 * directory load: it must be the SAME readout the canvas node shows, and a
 * system whose directory entry has not landed yet falls back to its bare id
 * rather than becoming a loading state.
 */
export function destinationReadout(
  toSystemId: number | null,
  systemInfo: ((id: number) => SystemDirectoryEntry | null) | null,
): SystemIdentityReadout | null {
  if (toSystemId === null) return null;
  const label = resolveSystemLabel(toSystemId, systemInfo);
  return systemIdentityReadout({
    name: label.name,
    security: label.security ?? null,
    whClassId: label.whClassId ?? null,
  });
}

function useDestinationReadout(
  toSystemId: number | null,
): SystemIdentityReadout | null {
  const assets = useUniverseAssets();
  return destinationReadout(
    toSystemId,
    assets === null ? null : (id: number) => assets.systemInfo(id),
  );
}

/** Mounts the editor for the currently edited connection, or nothing. */
export function ActiveSignatureEditor({
  mapId,
  connectionId,
  connectionDetails,
  unresolvedHoles,
  authoring,
  now,
  onClose,
  onFocusSystem,
}: ActiveSignatureEditorProps) {
  const connection = editedConnection(
    connectionId,
    connectionDetails,
    unresolvedHoles,
  );
  const selection = connectionEditorMode(connection, now);
  const destination = useDestinationReadout(connection?.toSystemId ?? null);

  // A row that tombstones past its undo window, or leaves the feed entirely,
  // closes the editor rather than freezing a stale copy of itself on screen.
  useEffect(() => {
    if (connectionId !== null && selection === null) onClose();
  }, [connectionId, selection, onClose]);

  if (selection === null) return null;
  const edited = selection.connection;
  const lifecycle = connectionLifecycleActions({
    mapId,
    connectionId: edited.connectionId,
    authoring,
    onDone: onClose,
  });
  return (
    <SignatureEditor
      connection={edited}
      mode={selection.mode}
      now={now}
      destination={destination}
      onFocusDestination={
        edited.toSystemId === null || onFocusSystem === undefined
          ? undefined
          : () => onFocusSystem(edited.toSystemId as number)
      }
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
