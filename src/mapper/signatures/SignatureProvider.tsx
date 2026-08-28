'use client';

import type { ReactNode } from 'react';
import type { Id } from '@/data/convex/data-model';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import { ActiveScannerPanel } from './ActiveScannerPanel';
import {
  applyWormholeType,
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

/**
 * Owns the signature page, tracked paste target, removal flow, and the shared
 * row context consumed by the permanent window and System Info cards.
 */
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
  /** Live tracked system when ready; otherwise the chain-root fallback. */
  readonly scannerSystemId: number | null;
  readonly pasteTarget: TrackedSystemTarget;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  /** The scanner panel's single open target, owned by the host. */
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
    missingBySystem,
    missingSystemId,
    removeMissing,
  } = useSignatureMissingFlow(mapId, canEdit, pasteTarget);
  const identifyRow = useIdentifySignature(mapId);
  const { jumpResolution, pickJumpCandidate } = useSignatureJumpFlow(
    mapId,
    canEdit,
    connectionDetails,
    unresolvedHoles,
  );
  const panel = useSignaturePanel(
    onPanelTargetChange,
    rows.length > 0 || panelTarget !== null,
    missingBySystem,
    missingSystemId,
    scannerSystemId,
    removeMissing,
  );

  return (
    <SignatureRowsProvider value={rows}>
      {children}
      <SignatureWindow
        scannerSystemId={scannerSystemId}
        rows={rows}
        missingIds={panel.highlightIds}
        missingCount={panel.missingIds.size}
        canEdit={canEdit}
        complete={complete}
        now={panel.now}
        onDismissMissing={dismissMissing}
        onRemoveMissing={panel.removeMissingRows}
        jumpResolution={jumpResolution}
        onPickJumpCandidate={pickJumpCandidate}
        onIdentify={identifyRow}
        onOpenEditor={panel.openEditor}
        onOpenSite={panel.openSite}
        originLeadConnections={[...connectionDetails.values()]}
        bindConnectionSetters={(connection, side) =>
          connectionFieldSetters(
            mapId,
            connection,
            authoring,
            (value) => {
              if (connection.toSystemId !== null) {
                void applyWormholeType({
                  mapId,
                  connection: connection as ConnectionDetail,
                  value,
                  side,
                  authoring,
                });
                return;
              }
              void authoring.setConnectionWormholeType({
                mapId,
                connection,
                value,
                side,
              });
            },
            side,
          )
        }
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
