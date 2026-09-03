import type { ScannerPanelTarget } from './signature-context';

export function scannerPanelBodyKind(
  panelTarget: ScannerPanelTarget,
  canEdit: boolean,
): 'connection' | 'site' | null {
  if (panelTarget?.kind === 'site') return 'site';
  if (panelTarget?.kind === 'connection' && canEdit) return 'connection';
  return null;
}
