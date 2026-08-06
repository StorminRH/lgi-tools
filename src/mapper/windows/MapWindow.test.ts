import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapWindow } from './MapWindow';
import type { WindowPlacement } from './window-model';

function render(
  placement: WindowPlacement,
  overrides: { showCloseButton?: boolean } = {},
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
        onPopToggle: vi.fn(),
        ...overrides,
      },
      createElement('p', null, 'content'),
    ),
  );
}

describe('MapWindow isolation markup', () => {
  it('owns nokey/scroller contracts and gates float-only drag/resize plus optional close', () => {
    const docked = render({ kind: 'docked' });
    expect(docked).toContain('data-map-window="test"');
    expect(docked).toContain('nokey');
    expect(docked).toContain('data-map-window-scroll');
    expect(docked).not.toContain('h-[calc(100dvh-5.5rem)]');
    expect(docked).not.toContain('data-map-window-drag');
    expect(docked).not.toContain('data-map-window-resize');
    expect(docked).toContain('Close Test window');

    const floating = render({
      kind: 'floating',
      rect: { x: 1, y: 2, width: 380, height: 520 },
    });
    expect(floating).toContain('data-map-window-drag');
    expect(floating).toContain('data-map-window-resize');
    expect(floating).toContain('aria-hidden="true"');

    expect(render({ kind: 'docked' }, { showCloseButton: false })).not.toContain(
      'Close Test window',
    );
  });
});
