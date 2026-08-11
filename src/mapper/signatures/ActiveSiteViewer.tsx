'use client';

// Read-only site body for the shared scanner-anchored panel. Available to any
// map viewer — not gated on canEdit. The sites feature owns the card widget.
import { SiteCardWidget } from '@/features/wormhole-sites/widget';
import { ScannerAnchoredPanel } from './ScannerAnchoredPanel';

/** Props for the live site-viewer host. */
export interface ActiveSiteViewerProps {
  readonly siteId: number;
  readonly signatureId: string;
  readonly onClose: () => void;
}

/**
 * Mounts the standalone sites card in the scanner-anchored panel for the
 * currently viewed site row.
 */
export function ActiveSiteViewer({
  siteId,
  signatureId,
  onClose,
}: ActiveSiteViewerProps) {
  return (
    <ScannerAnchoredPanel
      signatureId={signatureId}
      windowId="site-viewer"
      title="Site"
      onClose={onClose}
      layerProps={{ 'data-site-viewer': 'true' }}
    >
      <SiteCardWidget key={siteId} siteId={siteId} className="min-h-0 flex-1" />
    </ScannerAnchoredPanel>
  );
}
