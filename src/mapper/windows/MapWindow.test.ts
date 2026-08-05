import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapWindow } from './MapWindow';
import type { WindowPlacement } from './window-model';

function render(placement: WindowPlacement): string {
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
        onPopToggle: vi.fn(),
      },
      createElement('p', null, 'content'),
    ),
  );
}

describe('MapWindow isolation markup', () => {
  it('owns the nokey root and effective contained scroller', () => {
    const markup = render({ kind: 'docked' });

    expect(markup).toContain('data-map-window="test"');
    expect(markup).toContain('nokey');
    expect(markup).toContain('pointer-events-auto');
    expect(markup).toContain('data-map-window-scroll');
    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('overscroll-contain');
    expect(markup).toContain('glass-chrome');
    expect(markup).toContain('pl-[22px]');
    expect(markup).toContain('pr-3');
    expect(markup).toContain('left-4');
    expect(markup).toContain('bottom-16');
    expect(markup).not.toContain('h-[calc(100dvh-5.5rem)]');
  });

  it('mounts title-bar drag and resize affordances only while floating', () => {
    const docked = render({ kind: 'docked' });
    const floating = render({
      kind: 'floating',
      rect: { x: 1, y: 2, width: 380, height: 520 },
    });

    expect(docked).not.toContain('data-map-window-drag');
    expect(docked).not.toContain('data-map-window-resize');
    expect(floating).toContain('data-map-window-drag');
    expect(floating).toContain('cursor-move');
    expect(floating).toContain('data-map-window-resize');
    expect(floating).toContain('aria-hidden="true"');
  });

  it('can omit the title-bar close control', () => {
    const withClose = render({ kind: 'docked' });
    const withoutClose = renderToStaticMarkup(
      createElement(MapWindow, {
        windowId: 'test',
        title: 'Test window',
        placement: { kind: 'docked' },
        stackIndex: 1,
        onClose: vi.fn(),
        onActivate: vi.fn(),
        showCloseButton: false,
      }),
    );

    expect(withClose).toContain('Close Test window');
    expect(withoutClose).not.toContain('Close Test window');
  });
});
