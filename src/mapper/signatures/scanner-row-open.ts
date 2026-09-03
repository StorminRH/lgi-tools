import { siteIdForSiteName } from '@/features/wormhole-sites/site-name-lookup';
import type { Id } from '@/data/convex/data-model';
import type { SignatureWindowRow } from './signature-model';

export type ScannerRowOpenAction =
  | {
      readonly kind: 'connection';
      readonly connectionId: Id<'mapConnections'>;
      readonly signatureId: string;
    }
  | {
      readonly kind: 'site';
      readonly siteId: number;
      readonly signatureId: string;
    }
  | null;

export interface ScannerRowOpenHandlers {
  readonly openEditor: (
    connectionId: Id<'mapConnections'>,
    signatureId: string,
  ) => void;
  readonly openSite: (siteId: number, signatureId: string) => void;
}

export function scannerRowOpenAction(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null = siteIdForSiteName,
): ScannerRowOpenAction {
  if (row.connection !== null) {
    return canEdit
      ? {
          kind: 'connection',
          connectionId: row.connection.connectionId,
          signatureId: row.signatureId,
        }
      : null;
  }
  if (row.name !== null) {
    const siteId = resolveSiteId(row.name);
    if (siteId !== null) {
      return {
        kind: 'site',
        siteId,
        signatureId: row.signatureId,
      };
    }
  }
  return null;
}

export function scannerRowShowsOpenAffordance(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null = siteIdForSiteName,
): boolean {
  return scannerRowOpenAction(row, canEdit, resolveSiteId) !== null;
}

export function applyScannerRowOpenAction(
  action: ScannerRowOpenAction,
  handlers: ScannerRowOpenHandlers,
  _context: {
    readonly row: SignatureWindowRow;
    readonly trigger: HTMLElement;
    readonly clientX: number;
    readonly clientY: number;
  },
): void {
  if (action === null) return;
  if (action.kind === 'connection') {
    handlers.openEditor(action.connectionId, action.signatureId);
    return;
  }
  handlers.openSite(action.siteId, action.signatureId);
}
