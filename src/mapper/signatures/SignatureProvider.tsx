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
import { feedFreshnessIndex } from '../tracking/presence-model';
import { ActiveScannerPanel } from './ActiveScannerPanel';
import {
  answerAndAnnounce,
  type ConnectionAuthoringApi,
} from './connection-authoring-api';
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
  trackedPasteTarget,
  type ConnectionSignatureInput,
  type SignatureWindowRow,
  type TrackedPasteTarget,
} from './signature-model';
import { announceSignatureRemoval } from './signature-toast';
import { SignatureWindow } from './SignatureWindow';
import { useScannerPaste } from './use-scanner-paste';

const SIGNATURE_PAGE_SIZE = 100;
const SIGNATURE_AGE_TICK_MS = 60_000;
const EMPTY_MISSING: ReadonlySet<string> = new Set();
const LOADING_TARGET: TrackedPasteTarget = { kind: 'loading' };

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
    async (row: SignatureWindowRow, group: SigGroup): Promise<void> => {
      await identifySignature({
        mapId,
        systemId: row.systemId,
        signatureId: row.signatureId,
        group,
      });
      if (group === 'Wormhole') {
        await eliminateSignaturesAndAnnounce({ mapId, systemId: row.systemId });
      }
    },
    [identifySignature, mapId],
  );
}

function useTrackedPasteTarget(mapId: string): TrackedPasteTarget {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const freshness = useLiveValue(api.mapTracking.feedFreshness, { mapId });
  return useMemo(
    () =>
      // Both subscriptions must have delivered before "untracked" is a
      // truthful verdict — a warm-up paste reports loading, not a refusal.
      tracking === undefined || freshness === undefined
        ? LOADING_TARGET
        : trackedPasteTarget({
            ownTrackedCharacterIds: tracking.ownTrackedCharacterIds,
            tracked: tracking.tracked,
            freshness: feedFreshnessIndex(freshness),
          }),
    [tracking, freshness],
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

/**
 * Owns the signature page, tracked paste target, removal flow, and the shared
 * row context consumed by the permanent window and System Info cards.
 */
export function SignatureProvider({
  mapId,
  rootSystemId,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  authoring,
  panelTarget,
  onPanelTargetChange,
  onFocusSystem,
  children,
}: {
  readonly mapId: string;
  /** Chain root — the scanner window lists this system's rows, like the dock. */
  readonly rootSystemId: number | null;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly authoring: ConnectionAuthoringApi;
  /** The scanner panel's single open target, owned by the host. */
  readonly panelTarget: ScannerPanelTarget;
  readonly onPanelTargetChange: (target: ScannerPanelTarget) => void;
  /** Focuses one system on the canvas (the editor's locked Leads-to readout). */
  readonly onFocusSystem?: (systemId: number) => void;
  readonly children: ReactNode;
}) {
  const { rows, complete } = useSignaturePage(
    mapId,
    connectionDetails,
    unresolvedHoles,
  );
  const pasteTarget = useTrackedPasteTarget(mapId);
  const scannerSystemId = rootSystemId;
  const { bySystem: missingBySystem, replace, clearAll } = useMissingSignatures();
  // The missing-confirmation flow follows the system the paste was APPLIED to
  // (the pilot's tracked system), which is not necessarily the chain root the
  // scanner window lists — a scan pasted down the chain must still surface its
  // Dismiss/Remove prompt.
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
  const identifyRow = useIdentifySignature(mapId);
  const assets = useUniverseAssets();
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
          )
        : null,
    [assets, canEdit, connectionDetails, dismissedResolutions, unresolvedHoles],
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
  // One scanner panel for the whole map: connection edit and site view share
  // chrome; the scanner row and the canvas edge menu reach the same host state.
  const closePanel = useCallback(
    () => onPanelTargetChange(null),
    [onPanelTargetChange],
  );
  const openEditor = useCallback<OpenSignatureEditor>(
    (connectionId) =>
      onPanelTargetChange({ kind: 'connection', connectionId }),
    [onPanelTargetChange],
  );
  const openSite = useCallback(
    (siteId: number, signatureId: string) =>
      onPanelTargetChange({ kind: 'site', siteId, signatureId }),
    [onPanelTargetChange],
  );
  const now = useSignatureClock(rows.length > 0 || panelTarget !== null);
  const missingIds = missingIdsForSystem(missingBySystem, missingSystemId);
  // Row highlighting can only mark rows the window actually lists.
  const highlightIds =
    missingSystemId === scannerSystemId ? missingIds : EMPTY_MISSING;
  const dismissMissing = useCallback(() => {
    if (missingSystemId !== null) clearAll(missingSystemId);
  }, [missingSystemId, clearAll]);
  const removeMissingRows = useCallback(async () => {
    if (missingSystemId === null || missingIds.size === 0) return;
    await removeMissing(missingSystemId, [...missingIds]);
  }, [missingIds, removeMissing, missingSystemId]);

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
        now={now}
        onDismissMissing={dismissMissing}
        onRemoveMissing={removeMissingRows}
        jumpResolution={jumpResolution}
        onPickJumpCandidate={pickJumpCandidate}
        onIdentify={identifyRow}
        onOpenEditor={openEditor}
        onOpenSite={openSite}
      />
      <ActiveScannerPanel
        mapId={mapId}
        panelTarget={panelTarget}
        canEdit={canEdit}
        connectionDetails={connectionDetails}
        unresolvedHoles={unresolvedHoles}
        authoring={authoring}
        now={now}
        onClose={closePanel}
        onFocusSystem={onFocusSystem}
      />
    </SignatureRowsProvider>
  );
}
