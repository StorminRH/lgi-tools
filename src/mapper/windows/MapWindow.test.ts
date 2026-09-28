import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MapWindow } from './MapWindow';
import type { WindowPlacement } from './window-model';

function render(
  placement: WindowPlacement,
  overrides: { showCloseButton?: boolean; showHeader?: boolean } = {},
): string {
  return renderToStaticMarkup(
    createElement(
      MapWindow,
      {
        windowId: 'test',
        title: 'Test window',
        placement,
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
        ...overrides,
      },
      createElement('p', null, 'content'),
    ),
  );
}

it('owns docked isolation, optional close/header, and no floating-window resurrect', () => {
  const docked = render({ kind: 'docked' });
  expect(docked).toContain('data-map-window="test"');
  expect(docked).toContain('nokey');
  expect(docked).toContain('data-map-window-scroll');
  expect(docked).toContain('data-map-window-appearance="panel"');
  expect(docked).toContain('pointer-events-auto');
  expect(docked).not.toContain('data-map-window-drag');
  expect(docked).not.toContain('data-map-window-resize');
  expect(docked).toContain('Close Test window');

  expect(render({ kind: 'docked' }, { showCloseButton: false })).not.toContain(
    'Close Test window',
  );
  expect(render({ kind: 'docked' }, { showHeader: false })).not.toContain(
    '>Test window<',
  );
});

it('owns overlay, scanner-anchored, bottom-left, and node-anchored placement', () => {
  const overlay = renderToStaticMarkup(
    createElement(
      MapWindow,
      {
        windowId: 'dock',
        title: 'Jita',
        placement: { kind: 'docked' },
        appearance: 'overlay',
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
      },
      createElement('p', null, 'content'),
    ),
  );
  expect(overlay).toContain('data-map-window-appearance="overlay"');
  expect(overlay).toContain('pointer-events-none');

  const editor = renderToStaticMarkup(
    createElement(
      MapWindow,
      {
        windowId: 'signature-editor',
        title: 'Signature Editor',
        placement: { kind: 'scanner-anchored' },
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
      },
      createElement('p', null, 'content'),
    ),
  );
  expect(editor).toContain('data-map-window-placement="scanner-anchored"');
  expect(editor).not.toContain('--map-window-transform');

  const site = renderToStaticMarkup(
    createElement(
      MapWindow,
      {
        windowId: 'site-viewer',
        title: 'Site',
        placement: { kind: 'scanner-anchored', measure: 'site' },
        showCloseButton: false,
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
      },
      createElement('p', null, 'content'),
    ),
  );
  expect(site).toContain('data-map-window-placement="scanner-anchored"');
  expect(site).not.toContain('Close Site');

  const bottomLeft = render({ kind: 'docked-bottom-left' });
  expect(bottomLeft).toContain('data-map-window-placement="docked-bottom-left"');

  const nodeAnchored = render({ kind: 'node-anchored', systemId: 30_000_142 });
  expect(nodeAnchored).toContain('data-map-window-placement="node-anchored"');
  expect(nodeAnchored).toContain('[transform:var(--map-window-transform)]');
});
