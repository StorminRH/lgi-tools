import type { ScannerPanelTarget } from './signature-context';
import type { SignatureWindowRow } from './signature-model';

/** The panel a scanner row opens: its wormhole for editors, or its catalogue site. */
export function scannerRowOpenTarget(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null,
): ScannerPanelTarget {
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
