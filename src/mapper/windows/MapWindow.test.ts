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
  expect(docked).not.toContain('Pop out');
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
  expect(overlay).toContain('glass-panel-faint');
  expect(overlay).toContain('pointer-events-none');
  expect(overlay).toContain('h-auto');
  expect(overlay).toContain('w-max');
  expect(overlay).toContain('left-4 top-4');

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
  expect(editor).toContain('map-node-enter');
  expect(editor).toContain('data-map-window-placement="scanner-anchored"');
  expect(editor).toContain('md:left-[calc(min(33rem,100vw)+0.5rem)]');
  expect(editor).toContain('bottom-[calc(min(24rem,100dvh-7rem)+0.5rem)]');
  expect(editor).toContain(
    'max-h-[calc(100dvh-(min(24rem,100dvh-7rem)+0.5rem)-1rem)]',
  );
  expect(editor).toContain('md:max-h-[calc(100dvh-2rem)]');
  expect(editor).toContain('md:w-72');
  expect(editor).toContain('md:max-w-[calc(100vw-min(33rem,100vw)-2.5rem)]');
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
  expect(site).toContain('md:w-max');
  expect(site).not.toContain('md:w-72');
  expect(site).not.toContain('Close Site');

  const bottomLeft = render({ kind: 'docked-bottom-left' });
  expect(bottomLeft).toContain('data-map-window-placement="docked-bottom-left"');
  expect(bottomLeft).toContain('relative');
  expect(bottomLeft).toContain('h-auto');
  expect(bottomLeft).toContain('max-h-[min(24rem,calc(100dvh-7rem))]');
  expect(bottomLeft).toContain('w-full');
  expect(bottomLeft).toContain('min-w-0');
  expect(bottomLeft).toContain('glass-panel-faint');

  const nodeAnchored = render({ kind: 'node-anchored', systemId: 30_000_142 });
  expect(nodeAnchored).toContain('data-map-window-placement="node-anchored"');
  expect(nodeAnchored).toContain('[transform:var(--map-window-transform)]');
  expect(nodeAnchored).toContain('h-52 w-72');
});
