import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdmin: false,
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@/components/ui/menu', () => ({
  Menu: ({
    label,
    trigger,
    children,
  }: {
    label: string;
    trigger: React.ReactNode;
    children: React.ReactNode;
  }) =>
    createElement(
      'div',
      { 'data-menu': '', 'aria-label': label },
      createElement('span', { 'data-trigger': '' }, trigger),
      children,
    ),
  MenuItem: ({ children }: { children: React.ReactNode }) =>
    createElement('button', null, children),
  MenuLinkItem: ({ children }: { children: React.ReactNode }) =>
    createElement('a', null, children),
  menuRow: 'menu-row',
  menuSection: 'menu-section',
  menuSectionLabel: 'menu-section-label',
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) =>
    createElement('img', { 'data-portrait': name }),
}));

vi.mock('@/components/composition/account/AccountMenu', () => ({
  LogOutMenuItem: () => createElement('button', null, 'Log out'),
}));

vi.mock('@/components/composition/PageMenuSection', () => ({
  PageMenuSection: () => null,
}));

vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false, isAdmin: mocks.isAdmin }),
}));

vi.mock('@/platform/auth/link-character', () => ({
  startCharacterLink: vi.fn(),
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

const session = {
  characterId: 7,
  name: 'Mapper',
  portraitUrl: '/portrait.png',
  role: 'USER' as const,
};

describe('MapMenu', () => {
  beforeEach(() => {
    mocks.isAdmin = false;
    mocks.search = '';
  });

  it('mounts the creation door with the caller-owned corporation options', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, {
        session,
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

    expect(markup).toContain('New map');
    expect(markup).toContain('data-map-creation-door');
    expect(markup).toContain('data-corporation-count="1"');
    expect(markup).toMatch(/Deleted maps<span[^>]*>1<\/span>/);
    expect(markup).toContain('data-trash-window');
    expect(markup).toContain('data-trash-count="1"');
  });

  it('opens from the portrait and folds the account rows into one menu', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, {
        session,
        contextualSection: createElement('div', { 'data-tracking': '' }),
      }),
    );

    expect(markup).toContain('aria-label="Mapper — account menu"');
    expect(markup).toContain('data-portrait="Mapper"');
    expect(markup).toContain('Manage characters');
    expect(markup).toContain('Add character');
    expect(markup).toContain('Account settings');
    expect(markup).toContain('data-tracking');
    expect(markup).toContain('Log out');
    expect(markup).not.toContain('>Admin<');
    expect(markup.indexOf('data-tracking')).toBeLessThan(markup.indexOf('Log out'));
  });

  it('links the main site from the logo instead of listing each tool', () => {
    const markup = renderToStaticMarkup(createElement(MapMenu, { session }));
    expect(markup).toContain('LGI');
    expect(markup).not.toContain('Wormhole Sites');
    expect(markup).not.toContain('Industry Planner');
  });

  it('offers the admin console to admins', () => {
    mocks.isAdmin = true;
    const markup = renderToStaticMarkup(createElement(MapMenu, { session }));
    expect(markup).toContain('>Admin<');
  });

  it('offers a copyable link only while a map is open', () => {
    expect(
      renderToStaticMarkup(createElement(MapMenu, { session })),
    ).not.toContain('Copy map link');
    mocks.search = 'map=map-a';
    expect(renderToStaticMarkup(createElement(MapMenu, { session }))).toContain(
      'Copy map link',
    );
  });

  it('falls back to the glyph trigger without account rows when no character is active', () => {
    const markup = renderToStaticMarkup(createElement(MapMenu, { session: null }));
    expect(markup).toContain('aria-label="Atlas menu"');
    expect(markup).not.toContain('data-portrait');
    expect(markup).not.toContain('Log out');
    expect(markup).toContain('New map');
  });

  it('hides and closes map actions when the shared listing is unavailable', () => {
    const markup = renderToStaticMarkup(
      createElement(MapMenu, { session, mapActionsAvailable: false }),
    );
    expect(markup).not.toContain('New map');
    expect(markup).not.toContain('Deleted maps');
    expect(markup).toContain('data-map-creation-open="false"');
    expect(markup).toContain('data-trash-open="false"');
  });
});
