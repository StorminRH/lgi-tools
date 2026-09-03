'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import type { ScannedRow } from '@/data/maps/scan-parse';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import { isAdoptedPopupOpen } from '../windows/MapWindow';
import {
  isEditablePasteTarget,
  scannerPasteDecision,
  scannerPasteRefusalToast,
  type ScannerPasteDecision,
} from './signature-model';

function scanFailureMessage(error: unknown): string {
  const detail = String(error);
  if (detail.includes('OFF_MAP_SCAN_SYSTEM')) {
    return 'Your tracked character is not in a live system on this map.';
  }
  if (detail.includes('UNTRACKED_SCAN_SYSTEM')) {
    return 'Track an online character before pasting scanner output.';
  }
  return 'Scanner paste was not applied. Try again.';
}

function yieldsToFocusedSurface(event: ClipboardEvent): boolean {
  return [
    event.defaultPrevented,
    isEditablePasteTarget(event.target),
    isEditablePasteTarget(document.activeElement),
    isAdoptedPopupOpen(),
  ].some(Boolean);
}

function reportPasteDecision(
  decision: ScannerPasteDecision,
  applyRows: (systemId: number, rows: readonly ScannedRow[]) => Promise<void>,
): void {
  if (decision.kind !== 'apply') {
    const refusal = scannerPasteRefusalToast(decision);
    toast.error(refusal.message, refusal.options);
    return;
  }
  void applyRows(decision.systemId, decision.rows).catch((error: unknown) => {
    toast.error(scanFailureMessage(error), {
      id: 'scanner-paste:failed',
      duration: 5_000,
    });
  });
}

export function useScannerPaste(input: {
  readonly canEdit: boolean;
  readonly pasteTarget: TrackedSystemTarget;
  readonly applyRows: (
    systemId: number,
    rows: readonly ScannedRow[],
  ) => Promise<void>;
}): void {
  const { canEdit, pasteTarget, applyRows } = input;
  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      if (yieldsToFocusedSurface(event)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const decision = scannerPasteDecision(text, canEdit, pasteTarget);
      if (decision === null) return;
      event.preventDefault();
      reportPasteDecision(decision, applyRows);
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [applyRows, canEdit, pasteTarget]);
}
