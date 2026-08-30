'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { api } from '@/data/convex/api';
import { useMutation } from '@/data/convex/use-mutation';
import type { ScannedRow } from '@/data/maps/scan-parse';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';
import { announceSignatureRemoval } from './signature-toast';
import { useScannerPaste } from './use-scanner-paste';

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

export function missingIdsForSystem(
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
  readonly pasteTarget: TrackedSystemTarget;
  readonly scannerSystemId: number | null;
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
  useScannerPaste({
    canEdit: input.canEdit,
    pasteTarget: input.pasteTarget,
    applyRows,
  });
  const removeMissing = useRemoveMissingSignatures(input.mapId, clearAll);
  const dismissMissing = useCallback(() => {
    if (pasteTargetSystemId !== null) clearAll(pasteTargetSystemId);
  }, [pasteTargetSystemId, clearAll]);
  const missingIds = missingIdsForSystem(missingBySystem, pasteTargetSystemId);
  const highlightIds = listedMissingIds(
    pasteTargetSystemId,
    input.scannerSystemId,
    missingBySystem,
  );
  const removeMissingRows = useCallback(async () => {
    if (pasteTargetSystemId === null || missingIds.size === 0) return;
    await removeMissing(pasteTargetSystemId, [...missingIds]);
  }, [missingIds, removeMissing, pasteTargetSystemId]);
  return {
    dismissMissing,
    highlightIds,
    missingIds,
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
