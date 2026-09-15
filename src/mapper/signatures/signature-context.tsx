'use client';

import { createContext, useContext } from 'react';
import type { Id } from '@/data/convex/data-model';
import type { ConnectionDetail, UnresolvedHoleSummary } from '../chain/connection-detail';
import { useSignaturePage } from './use-signature-page';
import type { SignatureCounts, SignatureWindowRow } from './signature-model';
import { signatureCounts } from './signature-model';

interface SignatureData {
  readonly mapId: string;
  readonly scannerSystemId: number | null;
  readonly scannerRows: readonly SignatureWindowRow[];
  readonly connectionDetails: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>;
  readonly unresolvedHoles: readonly UnresolvedHoleSummary[];
}

const SignatureDataContext = createContext<SignatureData | null>(null);

export const SignatureDataProvider = SignatureDataContext.Provider;

export function useSignatureRows(systemId: number): readonly SignatureWindowRow[] {
  const data = useContext(SignatureDataContext);
  if (data === null) throw new Error('SignatureDataProvider is required');
  const { rows } = useSignaturePage(
    data.mapId,
    systemId === data.scannerSystemId ? null : systemId,
    data.connectionDetails,
    data.unresolvedHoles,
  );
  return systemId === data.scannerSystemId ? data.scannerRows : rows;
}

export function useSignatureCounts(systemId: number): SignatureCounts {
  return signatureCounts(useSignatureRows(systemId), systemId);
}

export type ScannerPanelTarget =
  | {
      readonly kind: 'connection';
      readonly connectionId: Id<'mapConnections'>;
      readonly signatureId: string | null;
    }
  | {
      readonly kind: 'site';
      readonly siteId: number;
      readonly signatureId: string;
    }
  | null;

export type OpenSignatureEditor = (
  connectionId: Id<'mapConnections'>,
  signatureId?: string | null,
) => void;
