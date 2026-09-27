'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import type { ScannedRow } from '@/data/maps/scan-parse';
import type { DockCharacter, PasteTarget } from '../tracking/tracked-system';
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
    return 'System not on map';
  }
  if (detail.includes('UNTRACKED_SCAN_SYSTEM')) {
    return 'No character online';
  }
  return 'Scan not applied';
}

function yieldsToFocusedSurface(event: ClipboardEvent): boolean {
  return [
    event.defaultPrevented,
    isEditablePasteTarget(event.target),
    isEditablePasteTarget(document.activeElement),
    isAdoptedPopupOpen(),
  ].some(Boolean);
}

/** A paste held until the user says which character scanned it. */
export interface PendingScannerPaste {
  readonly candidates: readonly DockCharacter[];
  readonly rows: readonly ScannedRow[];
}

export function applyScannerRows(
  applyRows: (systemId: number, rows: readonly ScannedRow[]) => Promise<void>,
  systemId: number,
  rows: readonly ScannedRow[],
): void {
  void applyRows(systemId, rows).catch((error: unknown) => {
    toast.error(scanFailureMessage(error), {
      id: 'scanner-paste:failed',
      duration: 5_000,
    });
  });
}

function reportPasteDecision(
  decision: ScannerPasteDecision,
  applyRows: (systemId: number, rows: readonly ScannedRow[]) => Promise<void>,
  onPendingPasteChange: (pending: PendingScannerPaste | null) => void,
): void {
  if (decision.kind === 'choose') {
    onPendingPasteChange({ candidates: decision.candidates, rows: decision.rows });
    return;
  }
  // A new scanner paste supersedes any scan still waiting for a character.
  onPendingPasteChange(null);
  if (decision.kind !== 'apply') {
    const refusal = scannerPasteRefusalToast(decision);
    toast.error(refusal.message, refusal.options);
    return;
  }
  applyScannerRows(applyRows, decision.systemId, decision.rows);
}

export function useScannerPaste(input: {
  readonly canEdit: boolean;
  readonly pasteTarget: PasteTarget;
  readonly applyRows: (
    systemId: number,
    rows: readonly ScannedRow[],
  ) => Promise<void>;
  readonly onPendingPasteChange: (pending: PendingScannerPaste | null) => void;
}): void {
  const { canEdit, pasteTarget, applyRows, onPendingPasteChange } = input;
  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      if (yieldsToFocusedSurface(event)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const decision = scannerPasteDecision(text, canEdit, pasteTarget);
      if (decision === null) return;
      event.preventDefault();
      reportPasteDecision(decision, applyRows, onPendingPasteChange);
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [applyRows, canEdit, onPendingPasteChange, pasteTarget]);
}
