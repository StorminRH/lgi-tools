'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { useActiveCharacterId } from '@/components/use-account-characters';
import { api } from '@/data/convex/api';
import { useDrainedPages } from '@/data/convex/use-drained-pages';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useMutation } from '@/data/convex/use-mutation';
import type { ScannedRow } from '@/data/maps/scan-parse';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { SignatureRowsProvider } from './signature-context';
import {
  buildSignatureRows,
  trackedPasteSystem,
  type ConnectionSignatureInput,
  type SignatureWindowRow,
} from './signature-model';
import { announceSignatureRemoval } from './signature-toast';
import { SignatureWindow } from './SignatureWindow';
import { useScannerPaste } from './use-scanner-paste';

const SIGNATURE_PAGE_SIZE = 100;
const SIGNATURE_AGE_TICK_MS = 60_000;
const EMPTY_MISSING: ReadonlySet<string> = new Set();
const EMPTY_TRACKING = { ownTrackedCharacterIds: [], tracked: [] } as const;

interface MissingSignatures {
  readonly bySystem: ReadonlyMap<number, ReadonlySet<string>>;
  readonly replace: (systemId: number, signatureIds: readonly string[]) => void;
  readonly clear: (systemId: number, signatureId: string) => void;
}

function connectionRows(
  resolved: ReadonlyMap<string, ConnectionDetail>,
  unresolved: readonly UnresolvedHoleSummary[],
): readonly ConnectionSignatureInput[] {
  return [...resolved.values(), ...unresolved];
}

function useSignaturePage(
  mapId: string,
  connectionDetails: ReadonlyMap<string, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
) {
  const signatures = useDrainedPages(
    api.mapScan.watchMapSignatures,
    { mapId },
    SIGNATURE_PAGE_SIZE,
  );
  const connections = useMemo(
    () => connectionRows(connectionDetails, unresolvedHoles),
    [connectionDetails, unresolvedHoles],
  );
  const rows = useMemo(
    () => buildSignatureRows(signatures.rows, connections),
    [signatures.rows, connections],
  );
  return { rows, complete: signatures.complete };
}

function useTrackedPasteSystem(mapId: string): number | null {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const characterId = useActiveCharacterId();
  const activeTracking = tracking ?? EMPTY_TRACKING;
  return trackedPasteSystem({
    characterId,
    ownTrackedCharacterIds: activeTracking.ownTrackedCharacterIds,
    tracked: activeTracking.tracked,
  });
}

function useSignatureClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), SIGNATURE_AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function useMissingSignatures(): MissingSignatures {
  const [bySystem, setBySystem] = useState<
    ReadonlyMap<number, ReadonlySet<string>>
  >(() => new Map());
  const replace = useCallback((systemId: number, signatureIds: readonly string[]) => {
    setBySystem((previous) => new Map(previous).set(systemId, new Set(signatureIds)));
  }, []);
  const clear = useCallback((systemId: number, signatureId: string) => {
    setBySystem((previous) => {
      const next = new Map(previous);
      const held = new Set(next.get(systemId) ?? []);
      held.delete(signatureId);
      next.set(systemId, held);
      return next;
    });
  }, []);
  return { bySystem, replace, clear };
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
    },
    [applyScan, mapId, replaceMissing],
  );
}

function useRemoveSignature(
  mapId: string,
  clearMissing: MissingSignatures['clear'],
) {
  const removeSignatures = useMutation(api.mapScan.removeSignatures);
  const restoreSignatures = useMutation(api.mapScan.restoreSignatures);
  return useCallback(
    async (row: SignatureWindowRow): Promise<void> => {
      const signatureIds = [row.signatureId];
      await removeSignatures({ mapId, systemId: row.systemId, signatureIds });
      clearMissing(row.systemId, row.signatureId);
      announceSignatureRemoval({
        systemId: row.systemId,
        signatureIds,
        onUndo: () => {
          void restoreSignatures({
            mapId,
            systemId: row.systemId,
            signatureIds,
          }).catch(() => {
            toast.error('Signature could not be restored.', {
              id: `signature-restore:${row.systemId}:${row.signatureId}`,
            });
          });
        },
      });
    },
    [clearMissing, mapId, removeSignatures, restoreSignatures],
  );
}

function missingIdsForSystem(
  bySystem: MissingSignatures['bySystem'],
  systemId: number | null,
): ReadonlySet<string> {
  return systemId === null
    ? EMPTY_MISSING
    : (bySystem.get(systemId) ?? EMPTY_MISSING);
}

/**
 * Owns the signature page, tracked paste target, removal flow, and the shared
 * row context consumed by the permanent window and System Info cards.
 */
export function SignatureProvider({
  mapId,
  canEdit,
  connectionDetails,
  unresolvedHoles,
  children,
}: {
  readonly mapId: string;
  readonly canEdit: boolean;
  readonly connectionDetails: ReadonlyMap<string, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
  readonly children: ReactNode;
}) {
  const { rows, complete } = useSignaturePage(
    mapId,
    connectionDetails,
    unresolvedHoles,
  );
  const activeSystemId = useTrackedPasteSystem(mapId);
  const { bySystem: missingBySystem, replace, clear } = useMissingSignatures();
  const applyRows = useApplySignatureScan(mapId, replace);
  useScannerPaste({ canEdit, systemId: activeSystemId, applyRows });
  const removeRow = useRemoveSignature(mapId, clear);
  const now = useSignatureClock(rows.length > 0);
  const dismissMissing = useCallback((signatureId: string) => {
    if (activeSystemId !== null) clear(activeSystemId, signatureId);
  }, [activeSystemId, clear]);

  return (
    <SignatureRowsProvider value={rows}>
      {children}
      <SignatureWindow
        activeSystemId={activeSystemId}
        rows={rows}
        missingIds={missingIdsForSystem(missingBySystem, activeSystemId)}
        canEdit={canEdit}
        complete={complete}
        now={now}
        onDismissMissing={dismissMissing}
        onRemove={removeRow}
      />
    </SignatureRowsProvider>
  );
}
