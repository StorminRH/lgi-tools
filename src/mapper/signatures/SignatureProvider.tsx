'use client';

import { useMemo, type ReactNode } from 'react';
import type { Id } from '@/data/convex/data-model';
import type {
  AwaitingJumpSummary,
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import type { PasteTarget } from '../tracking/tracked-system';
import { ActiveScannerPanel } from './ActiveScannerPanel';
import {
  bindConnectionSetters,
  type ConnectionAuthoringApi,
} from './connection-authoring-api';
import {
  SignatureDataProvider,
  type ScannerPanelTarget,
} from './signature-context';
import { SignatureWindow } from './SignatureWindow';
import { useIdentifySignature } from './use-identify-signature';
import { useSignatureJumpFlow } from './use-signature-jump-flow';
import { useSignatureMissingFlow } from './use-signature-missing-flow';
import { GlanceMarkIndexProvider } from './use-glance-mark-index';
import { useSignaturePage } from './use-signature-page';
import { useSignaturePanel } from './use-signature-panel';

export function SignatureProvider({
  mapId,
  scannerSystemId,
  pasteTarget,
  onScannerChosen,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  awaitingJumps,
  authoring,
  panelTarget,
  onPanelTargetChange,
  children,
}: {
  readonly mapId: string;
  readonly scannerSystemId: number | null;
  readonly pasteTarget: PasteTarget;
  readonly onScannerChosen: (characterId: number) => void;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly awaitingJumps: readonly AwaitingJumpSummary[];
  readonly authoring: ConnectionAuthoringApi;
  readonly panelTarget: ScannerPanelTarget;
  readonly onPanelTargetChange: (target: ScannerPanelTarget) => void;
  readonly children: ReactNode;
}) {
  const { rows, complete } = useSignaturePage(
    mapId,
    scannerSystemId,
    connectionDetails,
    unresolvedHoles,
  );
  const {
    cancelPendingPaste,
    chooseScanner,
    dismissMissing,
    highlightIds,
    missingIds,
    pendingPaste,
    removeMissingRows,
  } = useSignatureMissingFlow({
    mapId,
    canEdit,
    pasteTarget,
    scannerSystemId,
    onScannerChosen,
  });
  const identifyRow = useIdentifySignature(mapId);
  const { jumpResolution, pickJumpCandidate } = useSignatureJumpFlow(
    mapId,
    canEdit,
    connectionDetails,
    unresolvedHoles,
    awaitingJumps,
  );
  const panel = useSignaturePanel({
    onPanelTargetChange,
    clockActive: rows.length > 0 || panelTarget !== null,
  });

  const signatureData = useMemo(
    () => ({
      mapId, scannerSystemId, scannerRows: rows, connectionDetails, unresolvedHoles,
    }),
    [mapId, scannerSystemId, rows, connectionDetails, unresolvedHoles],
  );

  return (
    <SignatureDataProvider value={signatureData}>
      <GlanceMarkIndexProvider mapId={mapId}>{children}</GlanceMarkIndexProvider>
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
        pendingPaste={pendingPaste}
        onChooseScanner={chooseScanner}
        onCancelPendingPaste={cancelPendingPaste}
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
    </SignatureDataProvider>
  );
}
