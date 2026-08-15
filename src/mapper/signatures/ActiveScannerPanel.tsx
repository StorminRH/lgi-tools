'use client';

import type { ConnectionAuthoringApi } from './connection-authoring-api';
import { ActiveSignatureEditor } from './ActiveSignatureEditor';
import { ActiveSiteViewer } from './ActiveSiteViewer';
import { scannerPanelBodyKind } from './scanner-panel-body';
import type { ScannerPanelTarget } from './signature-context';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';

/** Props for the live scanner panel body host. */
export interface ActiveScannerPanelProps {
  readonly mapId: string;
  readonly panelTarget: ScannerPanelTarget;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<string, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly now: number;
  readonly onClose: () => void;
}

/**
 * Mounts the connection editor or read-only site viewer for the host's single
 * scanner panel target — never both.
 */
export function ActiveScannerPanel({
  mapId,
  panelTarget,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  authoring,
  now,
  onClose,
}: ActiveScannerPanelProps) {
  const body = scannerPanelBodyKind(panelTarget, canEdit);
  if (body === 'site' && panelTarget?.kind === 'site') {
    return (
      <ActiveSiteViewer
        siteId={panelTarget.siteId}
        signatureId={panelTarget.signatureId}
        onClose={onClose}
      />
    );
  }
  if (body === 'connection' && panelTarget?.kind === 'connection') {
    return (
      <ActiveSignatureEditor
        mapId={mapId}
        connectionId={panelTarget.connectionId}
        anchorSignatureId={panelTarget.signatureId}
        connectionDetails={connectionDetails}
        unresolvedHoles={unresolvedHoles}
        authoring={authoring}
        now={now}
        onClose={onClose}
      />
    );
  }
  return null;
}
