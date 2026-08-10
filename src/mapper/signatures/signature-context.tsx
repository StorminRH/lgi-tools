'use client';

import { createContext, useContext } from 'react';
import type {
  SignatureCounts,
  SignatureWindowRow,
} from './signature-model';
import { signatureCounts } from './signature-model';

const EMPTY_ROWS: readonly SignatureWindowRow[] = [];
const SignatureRowsContext = createContext(EMPTY_ROWS);

/** Shares one signature subscription with the window and System Info cards. */
export const SignatureRowsProvider = SignatureRowsContext.Provider;

/** One system's summary from the shared signature feed. */
export function useSignatureCounts(systemId: number): SignatureCounts {
  return signatureCounts(useContext(SignatureRowsContext), systemId);
}
