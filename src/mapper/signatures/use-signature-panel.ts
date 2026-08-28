'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type OpenSignatureEditor,
  type ScannerPanelTarget,
} from './signature-context';
import {
  EMPTY_MISSING,
  missingIdsForSystem,
} from './use-signature-missing-flow';

const SIGNATURE_AGE_TICK_MS = 60_000;

function useSignatureClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), SIGNATURE_AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function useSignaturePanel(
  onPanelTargetChange: (target: ScannerPanelTarget) => void,
  clockActive: boolean,
  missingBySystem: ReadonlyMap<number, ReadonlySet<string>>,
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
