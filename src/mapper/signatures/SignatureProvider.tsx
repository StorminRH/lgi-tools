'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useMutation } from '@/data/convex/use-mutation';
import { systemClassText } from '@/data/eve-data/system-identity';
import type { ScannedRow, SigGroup } from '@/data/maps/scan-parse';
import { useWormholeCodexData } from '../authoring/use-wormhole-editor-data';
import {
  useUniverseAssets,
  type ConnectionDetail,
  type UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import { ActiveScannerPanel } from './ActiveScannerPanel';
import {
  answerAndAnnounce,
  applyWormholeType,
  type ConnectionAuthoringApi,
} from './connection-authoring-api';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import {
  jumpAnswerTarget,
  pendingJumpResolution,
  type JumpResolutionCandidate,
} from './jump-resolution';
import {
  SignatureRowsProvider,
  type OpenSignatureEditor,
  type ScannerPanelTarget,
} from './signature-context';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';
import {
  buildSignatureRows,
  type ConnectionSignatureInput,
  type SignatureWindowRow,
} from './signature-model';
import { announceSignatureRemoval } from './signature-toast';
import { SignatureWindow } from './SignatureWindow';
import { useScannerPaste } from './use-scanner-paste';

const SIGNATURE_PAGE_SIZE = 100;
const SIGNATURE_AGE_TICK_MS = 60_000;
const EMPTY_MISSING: ReadonlySet<string> = new Set();

interface MissingSignatures {
  readonly bySystem: ReadonlyMap<number, ReadonlySet<string>>;
  readonly replace: (systemId: number, signatureIds: readonly string[]) => void;
  readonly clearAll: (systemId: number) => void;
}

function connectionRows(
  resolved: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolved: readonly UnresolvedHoleSummary[],
): readonly ConnectionSignatureInput[] {
  return [...resolved.values(), ...unresolved];
}

function useSignaturePage(
  mapId: string,
  connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
) {
  const signatures = useDrainedPages(
    api.mapScan.watchMapSignatures,
    { mapId },
    SIGNATURE_PAGE_SIZE,
  );
  const connections = useMemo(
    () => connectionRows(connectionDetails, unresolvedHoles),
    [connectionDetails, unresolvedHoles],
  );
  const { codex } = useWormholeCodexData(null);
  const rows = useMemo(
    () =>
      buildSignatureRows(signatures.rows, connections, (code) => {
        const entry = codex?.byCode(code) ?? null;
        return entry === null || entry.farSide
          ? null
          : systemClassText(entry.targetClass);
      }),
    [signatures.rows, connections, codex],
  );
  return { rows, complete: signatures.complete };
}

function useIdentifySignature(mapId: string) {
  const identifySignature = useMutation(api.mapScan.identifySignature);
  return useCallback(
    async (
      row: SignatureWindowRow,
      group: SigGroup,
      wormholeTypeCode?: string,
    ): Promise<void> => {
      await identifySignature({
        mapId,
        systemId: row.systemId,
        signatureId: row.signatureId,
        group,
        ...(wormholeTypeCode ? { wormholeTypeCode } : {}),
      });
      if (group === 'Wormhole') {
        await eliminateSignaturesAndAnnounce({ mapId, systemId: row.systemId });
      }
    },
    [identifySignature, mapId],
  );
}

function useSignatureClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), SIGNATURE_AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function useMissingSignatures(): MissingSignatures {
  const [bySystem, setBySystem] = useState<
    ReadonlyMap<number, ReadonlySet<string>>
  >(() => new Map());
  const replace = useCallback((systemId: number, signatureIds: readonly string[]) => {
    setBySystem((previous) => new Map(previous).set(systemId, new Set(signatureIds)));
  }, []);
  const clearAll = useCallback((systemId: number) => {
    setBySystem((previous) => new Map(previous).set(systemId, new Set()));
  }, []);
  return { bySystem, replace, clearAll };
}

function useApplySignatureScan(
  mapId: string,
  replaceMissing: MissingSignatures['replace'],
) {
  const applyScan = useMutation(api.mapScan.applyScan);
  return useCallback(
    async (systemId: number, scannedRows: readonly ScannedRow[]) => {
      const result = await applyScan({ mapId, systemId, rows: [...scannedRows] });
      replaceMissing(systemId, result.missing);
      toast.success(
        `Scan applied — ${result.inserted + result.updated + result.migrated} changed, ${result.unchanged} unchanged.`,
        { id: 'scanner-paste:applied', duration: 3_000 },
      );
      await eliminateSignaturesAndAnnounce({ mapId, systemId });
    },
    [applyScan, mapId, replaceMissing],
  );
}

function useRemoveMissingSignatures(
  mapId: string,
  clearAllMissing: MissingSignatures['clearAll'],
) {
  const removeSignatures = useMutation(api.mapScan.removeSignatures);
  const restoreSignatures = useMutation(api.mapScan.restoreSignatures);
  return useCallback(
    async (systemId: number, signatureIds: readonly string[]): Promise<void> => {
      if (signatureIds.length === 0) return;
      await removeSignatures({
        mapId,
        systemId,
        signatureIds: [...signatureIds],
      });
      clearAllMissing(systemId);
      announceSignatureRemoval({
        systemId,
        signatureIds,
        onUndo: () => {
          void restoreSignatures({
            mapId,
            systemId,
            signatureIds: [...signatureIds],
          }).catch(() => {
            toast.error('Signature could not be restored.', {
              id: `signature-restore:${systemId}:batch`,
            });
          });
        },
      });
    },
    [clearAllMissing, mapId, removeSignatures, restoreSignatures],
  );
}

function missingIdsForSystem(
  bySystem: MissingSignatures['bySystem'],
  systemId: number | null,
): ReadonlySet<string> {
  return systemId === null
    ? EMPTY_MISSING
    : (bySystem.get(systemId) ?? EMPTY_MISSING);
}

function useSignatureMissingFlow(
  mapId: string,
  canEdit: boolean,
  pasteTarget: TrackedSystemTarget,
) {
  const { bySystem: missingBySystem, replace, clearAll } = useMissingSignatures();
  // Missing confirmation follows the system the paste was applied to. When the
  // window is on the chain-root fallback, a down-chain paste still surfaces
  // its Dismiss/Remove prompt even if those rows are not listed.
  const [missingSystemId, setMissingSystemId] = useState<number | null>(null);
  const replaceForPaste = useCallback(
    (systemId: number, signatureIds: readonly string[]) => {
      replace(systemId, signatureIds);
      setMissingSystemId(systemId);
    },
    [replace],
  );
  const applyRows = useApplySignatureScan(mapId, replaceForPaste);
  useScannerPaste({ canEdit, pasteTarget, applyRows });
  const removeMissing = useRemoveMissingSignatures(mapId, clearAll);
  const dismissMissing = useCallback(() => {
    if (missingSystemId !== null) clearAll(missingSystemId);
  }, [missingSystemId, clearAll]);
  return {
    clearAll,
    dismissMissing,
    missingBySystem,
    missingSystemId,
    removeMissing,
  };
}

function useSignatureJumpFlow(
  mapId: string,
  canEdit: boolean,
  connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
) {
  const assets = useUniverseAssets();
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const ownCharacterIds = useMemo(
    () => new Set(tracking?.ownTrackedCharacterIds ?? []),
    [tracking?.ownTrackedCharacterIds],
  );
  const [dismissedResolutions, setDismissedResolutions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const jumpResolution = useMemo(
    () =>
      canEdit
        ? pendingJumpResolution(
            connectionDetails,
            unresolvedHoles,
            dismissedResolutions,
            assets === null ? null : (id: number) => assets.systemInfo(id),
            ownCharacterIds,
          )
        : null,
    [
      assets,
      canEdit,
      connectionDetails,
      dismissedResolutions,
      ownCharacterIds,
      unresolvedHoles,
    ],
  );
  const dismissResolution = useCallback((connectionId: string) => {
    setDismissedResolutions((previous) =>
      new Set(previous).add(connectionId),
    );
  }, []);
  const pickJumpCandidate = useCallback(
    (candidate: JumpResolutionCandidate) => {
      const connectionId = jumpResolution?.connectionId;
      if (connectionId === undefined) return;
      void answerAndAnnounce({
        mapId,
        connectionId,
        targetConnectionId: jumpAnswerTarget(candidate),
        dismiss: () => dismissResolution(connectionId),
      });
    },
    [dismissResolution, jumpResolution, mapId],
  );
  return { jumpResolution, pickJumpCandidate };
}

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

function useSignaturePanel(
  onPanelTargetChange: (target: ScannerPanelTarget) => void,
  clockActive: boolean,
  missingBySystem: MissingSignatures['bySystem'],
  missingSystemId: number | null,
  scannerSystemId: number | null,
  removeMissing: (
    systemId: number,
    signatureIds: readonly string[],
  ) => Promise<void>,
) {
  // One scanner panel for the whole map: connection edit and site view share
  // chrome; the scanner row and the canvas edge menu reach the same host state.
  const closePanel = useCallback(
    () => onPanelTargetChange(null),
    [onPanelTargetChange],
  );
  const openEditor = useCallback<OpenSignatureEditor>(
    (connectionId, signatureId) =>
      onPanelTargetChange({
        kind: 'connection',
        connectionId,
        signatureId: signatureId ?? null,
      }),
    [onPanelTargetChange],
  );
  const openSite = useCallback(
    (siteId: number, signatureId: string) =>
      onPanelTargetChange({ kind: 'site', siteId, signatureId }),
    [onPanelTargetChange],
  );
  const now = useSignatureClock(clockActive);
  const missingIds = missingIdsForSystem(missingBySystem, missingSystemId);
  // Row highlighting can only mark rows the window actually lists.
  const highlightIds =
    missingSystemId === scannerSystemId ? missingIds : EMPTY_MISSING;
  const removeMissingRows = useCallback(async () => {
    if (missingSystemId === null || missingIds.size === 0) return;
    await removeMissing(missingSystemId, [...missingIds]);
  }, [missingIds, removeMissing, missingSystemId]);
  return {
    closePanel,
    highlightIds,
    missingIds,
    now,
    openEditor,
    openSite,
    removeMissingRows,
  };
}

