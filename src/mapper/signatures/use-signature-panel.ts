'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type OpenSignatureEditor,
  type ScannerPanelTarget,
} from './signature-context';
import {
  listedMissingIds,
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
  pasteTargetSystemId: number | null,
  scannerSystemId: number | null,
  removeMissing: (
    systemId: number,
    signatureIds: readonly string[],
  ) => Promise<void>,
) {
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
  const missingIds = missingIdsForSystem(missingBySystem, pasteTargetSystemId);
  const highlightIds = listedMissingIds(
    pasteTargetSystemId,
    scannerSystemId,
    missingBySystem,
  );
  const removeMissingRows = useCallback(async () => {
    if (pasteTargetSystemId === null || missingIds.size === 0) return;
    await removeMissing(pasteTargetSystemId, [...missingIds]);
  }, [missingIds, removeMissing, pasteTargetSystemId]);
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
