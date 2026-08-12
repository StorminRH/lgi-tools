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
    open,
  }: {
    corporations: readonly { corporationId: number }[];
    open: boolean;
  }) =>
    createElement('div', {
      'data-map-creation-door': '',
      'data-corporation-count': corporations.length,
      'data-map-creation-open': String(open),
    }),
}));

vi.mock('@/features/maps/TrashWindow', () => ({
  TrashWindow: ({ maps, open }: { maps: readonly unknown[]; open: boolean }) =>
    createElement('div', {
      'data-trash-window': '',
      'data-trash-count': maps.length,
      'data-trash-open': String(open),
    }),
}));

import { MapMenu } from './MapMenu';

describe('MapMenu', () => {
  it('mounts the creation door with the caller-owned corporation options', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, {
        corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
        deletedMaps: [
          {
            id: 'map-a',
            name: 'Alpha',
            createdAt: new Date(),
            archivedAt: new Date(),
            creatorName: 'Mapper',
            role: 'admin',
            provenance: { kind: 'created' },
          },
        ],
      }),
    );

    expect(markup).toContain('Create map');
    expect(markup).toContain('data-map-creation-door');
    expect(markup).toContain('data-corporation-count="1"');
    expect(markup).toContain('Trash (1)');
    expect(markup).toContain('data-trash-window');
    expect(markup).toContain('data-trash-count="1"');
  });

  it('hides and closes map actions when the shared listing is unavailable', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, { mapActionsAvailable: false }),
    );
    expect(markup).not.toContain('Create map');
    expect(markup).not.toContain('>Trash<');
    expect(markup).toContain('data-map-creation-open="false"');
    expect(markup).toContain('data-trash-open="false"');
  });
});
