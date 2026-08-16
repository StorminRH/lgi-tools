import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActiveSiteViewer } from './ActiveSiteViewer';

vi.mock('@/features/wormhole-sites/widget', () => ({
  SiteCardWidget: (props: { siteId: number }) =>
    createElement('section', {
      'aria-label': 'Wormhole site card widget',
      'data-site-id': String(props.siteId),
    }),
}));

describe('ActiveSiteViewer', () => {
  it('hosts the standalone site widget in the shared scanner-anchored panel', () => {
    const markup = renderToStaticMarkup(
      createElement(ActiveSiteViewer, {
        siteId: 49,
        signatureId: 'GAS-001',
        onClose: vi.fn(),
      }),
    );
    expect(markup).toContain('data-map-window="site-viewer"');
    expect(markup).toContain('data-map-window-placement="scanner-anchored"');
    expect(markup).toContain('data-site-viewer="true"');
    expect(markup).toContain('data-signature-editor-layer');
    expect(markup).toContain('aria-label="Wormhole site card widget"');
    expect(markup).toContain('data-site-id="49"');
    // Catalogue-card measure; Escape / outside-click dismiss — no title-bar ×.
    expect(markup).toContain('md:w-max');
    expect(markup).not.toContain('md:w-[22rem]');
    expect(markup).not.toContain('Close Site');
    expect(markup).not.toContain('data-map-connection-fields');
    expect(markup).not.toContain('Signature Editor');
  });
});
