import type { ScannerPanelTarget } from './signature-context';

/**
 * Which scanner-panel body to mount for the current target. Site views are
 * available to any viewer; connection edit stays canEdit-gated.
 */
export function scannerPanelBodyKind(
  panelTarget: ScannerPanelTarget,
  canEdit: boolean,
): 'connection' | 'site' | null {
  if (panelTarget?.kind === 'site') return 'site';
  if (panelTarget?.kind === 'connection' && canEdit) return 'connection';
  return null;
}
