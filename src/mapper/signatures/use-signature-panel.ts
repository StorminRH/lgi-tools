'use client';

import { useCallback } from 'react';
import { useNow } from '@/lib/use-now';
import type { ScannerPanelTarget } from './signature-context';

const SIGNATURE_AGE_TICK_MS = 60_000;

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
  const now = useNow(SIGNATURE_AGE_TICK_MS, clockActive);
  return { closePanel, now };
}
