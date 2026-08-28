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

export const EMPTY_MISSING: ReadonlySet<string> = new Set();

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

export function useSignatureMissingFlow(
  mapId: string,
  canEdit: boolean,
  pasteTarget: TrackedSystemTarget,
) {
  const { bySystem: missingBySystem, replace, clearAll } = useMissingSignatures();
  // Missing confirmation follows the system the paste was applied to. When the
  // window is on the chain-root fallback, a down-chain paste still surfaces
  // its Dismiss/Remove prompt even if those rows are not listed.
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
  const dismissMissing = useCallback(() => {
    if (missingSystemId !== null) clearAll(missingSystemId);
  }, [missingSystemId, clearAll]);
  return {
    dismissMissing,
    missingBySystem,
    missingSystemId,
    removeMissing,
  };
}
