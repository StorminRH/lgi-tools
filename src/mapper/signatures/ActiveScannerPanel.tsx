'use client';

import type { ConnectionAuthoringApi } from './connection-authoring-api';
import { ActiveSignatureEditor } from './ActiveSignatureEditor';
import { ActiveSiteViewer } from './ActiveSiteViewer';
import type { ScannerPanelTarget } from './signature-context';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';

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
  if (panelTarget?.kind === 'site') {
    return (
      <ActiveSiteViewer
        siteId={panelTarget.siteId}
        signatureId={panelTarget.signatureId}
        onClose={onClose}
      />
    );
  }
  // Canvas menus open connections without row gating, and edit rights can
  // drop while a target is open, so the editor checks canEdit itself.
  if (panelTarget?.kind === 'connection' && canEdit) {
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
