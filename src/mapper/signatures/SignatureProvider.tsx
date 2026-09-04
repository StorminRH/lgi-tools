'use client';

import type { ReactNode } from 'react';
import type { Id } from '@/data/convex/data-model';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import { ActiveScannerPanel } from './ActiveScannerPanel';
import {
  bindConnectionSetters,
  type ConnectionAuthoringApi,
} from './connection-authoring-api';
import {
  SignatureRowsProvider,
  type ScannerPanelTarget,
} from './signature-context';
import { SignatureWindow } from './SignatureWindow';
import { useIdentifySignature } from './use-identify-signature';
import { useSignatureJumpFlow } from './use-signature-jump-flow';
import { useSignatureMissingFlow } from './use-signature-missing-flow';
import { useSignaturePage } from './use-signature-page';
import { useSignaturePanel } from './use-signature-panel';

export function SignatureProvider({
  mapId,
  scannerSystemId,
  pasteTarget,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  authoring,
  panelTarget,
  onPanelTargetChange,
  children,
}: {
  readonly mapId: string;
  readonly scannerSystemId: number | null;
  readonly pasteTarget: TrackedSystemTarget;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly panelTarget: ScannerPanelTarget;
  readonly onPanelTargetChange: (target: ScannerPanelTarget) => void;
  readonly children: ReactNode;
}) {
  const { rows, complete } = useSignaturePage(
    mapId,
    connectionDetails,
    unresolvedHoles,
  );
  const {
    dismissMissing,
    highlightIds,
    missingIds,
    removeMissingRows,
  } = useSignatureMissingFlow({
    mapId,
    canEdit,
    pasteTarget,
    scannerSystemId,
  });
  const identifyRow = useIdentifySignature(mapId);
  const { jumpResolution, pickJumpCandidate } = useSignatureJumpFlow(
    mapId,
    canEdit,
    connectionDetails,
    unresolvedHoles,
  );
  const panel = useSignaturePanel({
    onPanelTargetChange,
    clockActive: rows.length > 0 || panelTarget !== null,
  });

  return (
    <SignatureRowsProvider value={rows}>
      {children}
      <SignatureWindow
        scannerSystemId={scannerSystemId}
        rows={rows}
        missingIds={highlightIds}
        missingCount={missingIds.size}
        canEdit={canEdit}
        complete={complete}
        now={panel.now}
        onDismissMissing={dismissMissing}
        onRemoveMissing={removeMissingRows}
        jumpResolution={jumpResolution}
        onPickJumpCandidate={pickJumpCandidate}
        onIdentify={identifyRow}
        onOpenEditor={panel.openEditor}
        onOpenSite={panel.openSite}
        originLeadConnections={[...connectionDetails.values()]}
        bindConnectionSetters={bindConnectionSetters(mapId, authoring)}
      />
      <ActiveScannerPanel
        mapId={mapId}
        panelTarget={panelTarget}
        canEdit={canEdit}
        connectionDetails={connectionDetails}
        unresolvedHoles={unresolvedHoles}
        authoring={authoring}
        now={panel.now}
        onClose={panel.closePanel}
      />
    </SignatureRowsProvider>
  );
}
