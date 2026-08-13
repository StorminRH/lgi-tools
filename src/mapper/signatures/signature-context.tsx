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

/** Shares one signature subscription with the window and System Info cards. */
export const SignatureRowsProvider = SignatureRowsContext.Provider;

/** One system's summary from the shared signature feed. */
export function useSignatureCounts(systemId: number): SignatureCounts {
  return signatureCounts(useContext(SignatureRowsContext), systemId);
}

/**
 * The scanner panel's single open target: a connection edit or a read-only
 * site view.
 */
export type ScannerPanelTarget =
  | {
      readonly kind: 'connection';
      readonly connectionId: Id<'mapConnections'>;
      /** Scanner row to attach the leader; null for canvas edge-menu opens. */
      readonly signatureId: string | null;
    }
  | {
      readonly kind: 'site';
      readonly siteId: number;
      readonly signatureId: string;
    }
  | null;

/**
 * Opens the map's one Signature Editor on a connection (ruling D-F). The chain
 * host owns which panel target is open, so the scanner row and the canvas edge
 * menu reach the same pop-out instead of growing a second editing surface.
 * `signatureId` is the scanner row the leader should bracket; omit it when the
 * open did not come from a row.
 */
export type OpenSignatureEditor = (
  connectionId: Id<'mapConnections'>,
  signatureId?: string | null,
) => void;
