'use client';

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
import type {
  ConnectionDetail,
  ConnectionEditorDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import { useUniverseAssets } from '../chain/use-universe-assets';
import { SignatureEditor } from './SignatureEditor';
import { doorLeadsTo } from '@/data/maps/connection-door-destinations';
import { destinationReadout } from './system-readout';

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

export interface ActiveSignatureEditorProps {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'> | null;
  readonly anchorSignatureId?: string | null;
  readonly connectionDetails: ReadonlyMap<string, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly now: number;
  readonly onClose: () => void;
}

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
  const destination = destinationReadout(
    connection === null
      ? null
      : doorLeadsTo(
          connection.fromSystemId,
          connection.toSystemId,
          'from',
          connection.from,
        ),
    systemInfo,
  );
  const originLeads = originLeadOptions(
    connection,
    [...connectionDetails.values()],
    systemInfo,
  );

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
      edited.toSystemId === null && edited.from.signatureId !== null
        ? {
            systemId: edited.fromSystemId,
            signatureId: edited.from.signatureId,
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
