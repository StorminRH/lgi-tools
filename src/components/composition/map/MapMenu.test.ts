import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children: React.ReactNode }) =>
    createElement('div', { 'data-menu': '' }, children),
  MenuItem: ({ children }: { children: React.ReactNode }) =>
    createElement('button', null, children),
  MenuLinkItem: ({ children }: { children: React.ReactNode }) =>
    createElement('a', null, children),
  menuRow: 'menu-row',
}));

vi.mock('@/features/maps/MapCreationDialog', () => ({
  MapCreationDialog: ({
    corporations,
  }: {
    corporations: readonly { corporationId: number }[];
  }) =>
    createElement('div', {
      'data-map-creation-door': '',
      'data-corporation-count': corporations.length,
    }),
}));

import { MapMenu } from './MapMenu';

describe('MapMenu', () => {
  it('mounts the creation door with the caller-owned corporation options', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, {
        corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
      }),
    );

    expect(markup).toContain('Create map');
    expect(markup).toContain('data-map-creation-door');
    expect(markup).toContain('data-corporation-count="1"');
  });
});
