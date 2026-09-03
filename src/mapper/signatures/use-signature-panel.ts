'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type OpenSignatureEditor,
  type ScannerPanelTarget,
} from './signature-context';

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

export function useSignaturePanel({
  onPanelTargetChange,
  clockActive,
}: {
  readonly onPanelTargetChange: (target: ScannerPanelTarget) => void;
  readonly clockActive: boolean;
}) {
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
  return {
    closePanel,
    now,
    openEditor,
    openSite,
  };
}
