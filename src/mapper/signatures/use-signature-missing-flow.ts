'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { api } from '@/data/convex/api';
import { useMutation } from '@/data/convex/use-mutation';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { pasteSemanticWrite, pasteWriteDigest } from '@/data/maps/semantic-write';
import type { PasteTarget } from '../tracking/tracked-system';
import { followUpElimination } from './signature-elimination-client';
import {
  removeSignaturesWithUndo,
  type SignatureSelectionMutations,
} from './signature-removal';
import {
  applyScannerRows,
  useScannerPaste,
  type PendingScannerPaste,
} from './use-scanner-paste';

const EMPTY_MISSING: ReadonlySet<string> = new Set();

interface MissingSignatures {
  readonly bySystem: ReadonlyMap<number, ReadonlySet<string>>;
  readonly replace: (systemId: number, signatureIds: readonly string[]) => void;
  readonly clearAll: (systemId: number) => void;
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
      toast.success('Scan applied', { duration: 3_000 });
      await followUpElimination({
        mapId,
        systemId,
        write: pasteSemanticWrite(result),
        digest: pasteWriteDigest(
          systemId,
          scannedRows.map((row) => row.signatureId),
        ),
      });
    },
    [applyScan, mapId, replaceMissing],
  );
}

function missingIdsForSystem(
  bySystem: ReadonlyMap<number, ReadonlySet<string>>,
  systemId: number | null,
): ReadonlySet<string> {
  return systemId === null
    ? EMPTY_MISSING
    : (bySystem.get(systemId) ?? EMPTY_MISSING);
}

export function useSignatureMissingFlow(input: {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly pasteTarget: PasteTarget;
  readonly scannerSystemId: number | null;
  readonly onScannerChosen: (characterId: number) => void;
  readonly authoring: SignatureSelectionMutations;
}) {
  const { bySystem: missingBySystem, replace, clearAll } = useMissingSignatures();
  const [pasteTargetSystemId, setPasteTargetSystemId] = useState<number | null>(
    null,
  );
  const replaceForPaste = useCallback(
    (systemId: number, signatureIds: readonly string[]) => {
      replace(systemId, signatureIds);
      setPasteTargetSystemId(systemId);
    },
    [replace],
  );
  const applyRows = useApplySignatureScan(input.mapId, replaceForPaste);
  const [pendingPaste, setPendingPaste] = useState<PendingScannerPaste | null>(null);
  useScannerPaste({
    canEdit: input.canEdit,
    pasteTarget: input.pasteTarget,
    applyRows,
    onPendingPasteChange: setPendingPaste,
  });
  const { onScannerChosen } = input;
  const chooseScanner = useCallback(
    (characterId: number) => {
      const scanner = pendingPaste?.candidates.find(
        (candidate) => candidate.characterId === characterId,
      );
      setPendingPaste(null);
      if (pendingPaste === null || scanner?.systemId == null) return;
      onScannerChosen(characterId);
      applyScannerRows(applyRows, scanner.systemId, pendingPaste.rows);
    },
    [applyRows, onScannerChosen, pendingPaste],
  );
  const cancelPendingPaste = useCallback(() => setPendingPaste(null), []);
  const dismissMissing = useCallback(() => {
    if (pasteTargetSystemId !== null) clearAll(pasteTargetSystemId);
  }, [pasteTargetSystemId, clearAll]);
  const missingIds = missingIdsForSystem(missingBySystem, pasteTargetSystemId);
  const highlightIds = listedMissingIds(
    pasteTargetSystemId,
    input.scannerSystemId,
    missingBySystem,
  );
  const { mapId, authoring } = input;
  const removeMissingRows = useCallback(async () => {
    if (pasteTargetSystemId === null) return;
    const removed = await removeSignaturesWithUndo({
      mapId,
      systemId: pasteTargetSystemId,
      signatureIds: [...missingIds],
      mutations: authoring,
    });
    if (removed) clearAll(pasteTargetSystemId);
  }, [authoring, clearAll, mapId, missingIds, pasteTargetSystemId]);
  return {
    cancelPendingPaste,
    chooseScanner,
    dismissMissing,
    highlightIds,
    missingIds,
    pendingPaste,
    removeMissingRows,
  };
}

export function listedMissingIds(
  pasteTargetSystemId: number | null,
  listedSystemId: number | null,
  missingBySystem: ReadonlyMap<number, ReadonlySet<string>>,
): ReadonlySet<string> {
  if (pasteTargetSystemId !== listedSystemId) return EMPTY_MISSING;
  return missingIdsForSystem(missingBySystem, pasteTargetSystemId);
}
