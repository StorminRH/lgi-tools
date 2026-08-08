'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { isAdoptedPopupOpen } from '../windows/MapWindow';
import {
  isEditablePasteTarget,
  scannerPasteDecision,
  type ScannerPasteDecision,
} from './signature-model';

function scanFailureMessage(error: unknown): string {
  const detail = String(error);
  if (detail.includes('OFF_MAP_SCAN_SYSTEM')) {
    return 'Your tracked character is not in a live system on this map.';
  }
  if (detail.includes('UNTRACKED_SCAN_SYSTEM')) {
    return 'Track your active character before pasting scanner output.';
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

function refusalToast(decision: Exclude<ScannerPasteDecision, { kind: 'apply' }>) {
  if (decision.kind === 'reject') {
    const suffix = decision.rejectCount === 1 ? '' : 's';
    return {
      message: `Scanner paste rejected — ${decision.rejectCount} row${suffix} need attention.`,
      options: { id: 'scanner-paste:rejected', duration: 5_000 },
    };
  }
  return decision.kind === 'read-only'
    ? {
        message: 'Edit access is required to apply scanner output.',
        options: { id: 'scanner-paste:read-only' },
      }
    : {
        message: 'Track your active character before pasting scanner output.',
        options: { id: 'scanner-paste:untracked' },
      };
}

function reportPasteDecision(
  decision: ScannerPasteDecision,
  applyRows: (systemId: number, rows: readonly ScannedRow[]) => Promise<void>,
): void {
  if (decision.kind !== 'apply') {
    const refusal = refusalToast(decision);
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

/** Owns the Atlas page's one cleaned-up document-level scanner paste listener. */
export function useScannerPaste(input: {
  readonly canEdit: boolean;
  readonly systemId: number | null;
  readonly applyRows: (
    systemId: number,
    rows: readonly ScannedRow[],
  ) => Promise<void>;
}): void {
  const { canEdit, systemId, applyRows } = input;
  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      if (yieldsToFocusedSurface(event)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const decision = scannerPasteDecision(text, canEdit, systemId);
      if (decision === null) return;
      event.preventDefault();
      reportPasteDecision(decision, applyRows);
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [applyRows, canEdit, systemId]);
}
