'use client';

import { SiteCardWidget } from '@/features/wormhole-sites/widget';
import { ScannerAnchoredPanel } from './ScannerAnchoredPanel';

export interface ActiveSiteViewerProps {
  readonly siteId: number;
  readonly signatureId: string;
  readonly onClose: () => void;
}

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
      measure="site"
      showCloseButton={false}
      onClose={onClose}
      layerProps={{ 'data-site-viewer': 'true' }}
    >
      <SiteCardWidget
        key={siteId}
        siteId={siteId}
        className="min-h-0 w-max max-w-full flex-1"
      />
    </ScannerAnchoredPanel>

  );
}
