'use client';

import { createContext, useContext } from 'react';
import type { Id } from '@/data/convex/data-model';
import type {
  SignatureCounts,
  SignatureWindowRow,
} from './signature-model';
import { signatureCounts } from './signature-model';

const EMPTY_ROWS: readonly SignatureWindowRow[] = [];
const SignatureRowsContext = createContext(EMPTY_ROWS);

export const SignatureRowsProvider = SignatureRowsContext.Provider;

export function useSignatureCounts(systemId: number): SignatureCounts {
  return signatureCounts(useContext(SignatureRowsContext), systemId);
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
