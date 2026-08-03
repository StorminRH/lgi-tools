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
        surfaceKind: placement.kind === 'node-anchored' ? 'card' : 'dock',
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
  });

  it('mounts drag and resize affordances only while floating', () => {
    const docked = render({ kind: 'docked' });
    const floating = render({
      kind: 'floating',
      rect: { x: 1, y: 2, width: 380, height: 520 },
    });

    expect(docked).not.toContain('Drag Test window');
    expect(docked).not.toContain('Resize Test window');
    expect(floating).toContain('Drag Test window');
    expect(floating).toContain('Resize Test window');
  });
});
