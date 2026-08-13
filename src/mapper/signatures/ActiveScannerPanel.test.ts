import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { ActiveScannerPanel } from './ActiveScannerPanel';

vi.mock('./ActiveSignatureEditor', () => ({
  ActiveSignatureEditor: (props: {
    connectionId: string;
    anchorSignatureId?: string | null;
  }) =>
    createElement('div', {
      'data-active-signature-editor': props.connectionId,
      'data-editor-anchor': props.anchorSignatureId ?? '',
    }),
}));

vi.mock('./ActiveSiteViewer', () => ({
  ActiveSiteViewer: (props: { siteId: number; signatureId: string }) =>
    createElement('div', {
      'data-active-site-viewer': String(props.siteId),
      'data-signature-id': props.signatureId,
    }),
}));

const authoring = {
  setConnectionWormholeType: vi.fn(),
  setConnectionShipSize: vi.fn(),
  setConnectionMassState: vi.fn(),
  setConnectionLifeStage: vi.fn(),
  setConnectionLeadsTo: vi.fn(),
  removeConnection: vi.fn(),
  restoreConnection: vi.fn(),
};

function render(
  panelTarget: Parameters<typeof ActiveScannerPanel>[0]['panelTarget'],
  canEdit: boolean,
): string {
  return renderToStaticMarkup(
    createElement(ActiveScannerPanel, {
      mapId: 'map-1',
      panelTarget,
      canEdit,
      connectionDetails: new Map(),
      unresolvedHoles: [],
      authoring: authoring as never,
      now: 1_000,
      onClose: vi.fn(),
    }),
  );
}

describe('ActiveScannerPanel', () => {
  it('mounts site for viewers and connection editor only when canEdit', () => {
    const site = render(
      { kind: 'site', siteId: 49, signatureId: 'GAS-001' },
      false,
    );
    expect(site).toContain('data-active-site-viewer="49"');
    expect(site).toContain('data-signature-id="GAS-001"');
    expect(site).not.toContain('data-active-signature-editor');

    const editor = render(
      {
        kind: 'connection',
        connectionId: 'connection-1' as Id<'mapConnections'>,
        signatureId: null,
      },
      true,
    );
    expect(editor).toContain('data-active-signature-editor="connection-1"');
    expect(editor).toContain('data-editor-anchor=""');
    expect(editor).not.toContain('data-active-site-viewer');

    const far = render(
      {
        kind: 'connection',
        connectionId: 'connection-1' as Id<'mapConnections'>,
        signatureId: 'YXX-744',
      },
      true,
    );
    expect(far).toContain('data-editor-anchor="YXX-744"');

    expect(
      render(
        {
          kind: 'connection',
          connectionId: 'connection-1' as Id<'mapConnections'>,
          signatureId: 'YXX-744',
        },
        false,
      ),
    ).toBe('');
    expect(render(null, true)).toBe('');
  });
});
