import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

describe('MapWindow isolation markup', () => {
  it('owns nokey/scroller contracts with an optional close control', () => {
    const docked = render({ kind: 'docked' });
    expect(docked).toContain('data-map-window="test"');
    expect(docked).toContain('nokey');
    expect(docked).toContain('data-map-window-scroll');
    expect(docked).toContain('data-map-window-appearance="panel"');
    expect(docked).toContain('glass-panel');
    expect(docked).not.toContain('h-[calc(100dvh-5.5rem)]');
    // The floating window machinery (drag handle, resize grip, pop toggle)
    // left with the persistent-overlay dock; nothing may resurrect silently.
    expect(docked).not.toContain('data-map-window-drag');
    expect(docked).not.toContain('data-map-window-resize');
    expect(docked).not.toContain('Pop out');
    expect(docked).toContain('Close Test window');
    expect(docked).toContain('pointer-events-auto');

    expect(render({ kind: 'docked' }, { showCloseButton: false })).not.toContain(
      'Close Test window',
    );
    expect(render({ kind: 'docked' }, { showHeader: false })).not.toContain(
      '>Test window<',
    );
  });

  it('renders overlay appearance as a content-sized faint glass caption', () => {
    const html = renderToStaticMarkup(
      createElement(MapWindow, {
        windowId: 'dock',
        title: 'Jita',
        placement: { kind: 'docked' },
        appearance: 'overlay',
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
      }, createElement('p', null, 'content')),
    );
    expect(html).toContain('data-map-window-appearance="overlay"');
    expect(html).toContain('glass-panel-faint');
    // Passive readout: it must not steal node clicks, drags, or pans from the
    // canvas laid out beneath it.
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('h-auto');
    expect(html).toContain('w-max');
    expect(html).toContain('text-left');
    expect(html).toContain('text-h3');
    expect(html).toContain('font-bold');
    expect(html).toContain('left-4 top-4');
    expect(html).not.toContain('glass-panel ');
    expect(html).not.toContain('border-border-idle');
    expect(html).not.toContain('shadow-dd');
    expect(html).not.toContain('bottom-16');
  });

  it('plays the node birth overshoot on the scanner-anchored editor', () => {
    const html = renderToStaticMarkup(
      createElement(MapWindow, {
        windowId: 'signature-editor',
        title: 'Signature Editor',
        placement: { kind: 'scanner-anchored' },
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
      }, createElement('p', null, 'content')),
    );
    expect(html).toContain('map-node-enter');
    expect(html).toContain('data-map-window-placement="scanner-anchored"');
    // Stacks above the dock on narrow viewports; parks beside it from md up.
    expect(html).toContain('md:left-[calc(1rem+min(24rem,100vw-2rem)+0.5rem)]');
    expect(html).toContain('bottom-[calc(1rem+min(24rem,100vw-2rem,100dvh-7rem)+0.5rem)]');
    // Parked beside the dock in screen space, never riding a canvas transform.
    expect(html).not.toContain('--map-window-transform');
  });

  it('owns the one bottom-left geometry variant for the signature sibling', () => {
    const html = render({ kind: 'docked-bottom-left' });
    expect(html).toContain('data-map-window-placement="docked-bottom-left"');
    expect(html).toContain('bottom-4 left-4');
    expect(html).toContain('size-[min(24rem,calc(100vw-2rem))]');
  });

  it('covers node-anchored placement and Escape keydown wiring', () => {
    const html = render({ kind: 'node-anchored', systemId: 30_000_142 });
    expect(html).toContain('data-map-window-placement="node-anchored"');
    expect(html).toContain('[transform:var(--map-window-transform)]');
    expect(html).toContain('h-52 w-72');
  });
});
