import { siteIdForSiteName } from '@/features/wormhole-sites/site-name-lookup';
import type { Id } from '@/data/convex/data-model';
import type { SignatureWindowRow } from './signature-model';

/**
 * What a scanner row click opens: a connection edit, a read-only site view,
 * the unresolved identify menu, or nothing.
 */
export type ScannerRowOpenAction =
  | { readonly kind: 'connection'; readonly connectionId: Id<'mapConnections'> }
  | {
      readonly kind: 'site';
      readonly siteId: number;
      readonly signatureId: string;
    }
  | { readonly kind: 'identify' }
  | null;

/** Host callbacks that apply a resolved scanner-row open action. */
export interface ScannerRowOpenHandlers {
  readonly openEditor: (connectionId: Id<'mapConnections'>) => void;
  readonly openSite: (siteId: number, signatureId: string) => void;
  readonly openIdentify: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}

/**
 * Resolves the click action for one scanner row. Catalogue-matched site rows
 * open for any viewer; connection edit and identify stay canEdit-gated.
 * Pass a reactive `resolveSiteId` from {@link useSiteCatalogue} on the atlas
 * so first paint matches the layout-seeded index.
 */
export function scannerRowOpenAction(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null = siteIdForSiteName,
): ScannerRowOpenAction {
  if (row.connection !== null) {
    return canEdit
      ? { kind: 'connection', connectionId: row.connection.connectionId }
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
  if (canEdit && row.group === null) return { kind: 'identify' };
  return null;
}

/** Whether the row shows the hover-open affordance and is clickable. */
export function scannerRowShowsOpenAffordance(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null = siteIdForSiteName,
): boolean {
  return scannerRowOpenAction(row, canEdit, resolveSiteId) !== null;
}

/**
 * Applies a resolved row-open action through the scanner window's host
 * callbacks. Null actions are ignored.
 */
export function applyScannerRowOpenAction(
  action: ScannerRowOpenAction,
  handlers: ScannerRowOpenHandlers,
  context: {
    readonly row: SignatureWindowRow;
    readonly trigger: HTMLElement;
    readonly clientX: number;
    readonly clientY: number;
  },
): void {
  if (action === null) return;
  if (action.kind === 'connection') {
    handlers.openEditor(action.connectionId);
    return;
  }
  if (action.kind === 'site') {
    handlers.openSite(action.siteId, action.signatureId);
    return;
  }
  handlers.openIdentify(
    context.row,
    context.trigger,
    context.clientX,
    context.clientY,
  );
}
