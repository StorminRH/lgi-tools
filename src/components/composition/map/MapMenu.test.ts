import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

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
  MenuItem: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    'aria-label'?: string;
  }) => createElement('button', { 'aria-label': ariaLabel }, children),
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
  PageMenuSection: ({ children }: { children?: React.ReactNode }) =>
    createElement('section', { 'data-map-settings': '' }, children),
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

import { MapMenu } from './MapMenu';

const session = {
  characterId: 7,
  name: 'Mapper',
  portraitUrl: '/portrait.png',
  role: 'USER' as const,
};

test('signed-in portrait menu keeps map actions, account rows, and the home mark', () => {
  mocks.isAdmin = false;
  mocks.search = '';
  const door = renderToStaticMarkup(
    createElement(MapMenu, {
      session,
      corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
    }),
  );
  expect(door).toContain('>Maps<');
  expect(door.indexOf('>Maps<')).toBeLessThan(door.indexOf('New map'));
  expect(door).toContain('data-map-creation-door');
  expect(door).toContain('data-corporation-count="1"');
  expect(door).toContain('LGI');

  const menu = renderToStaticMarkup(
    createElement(MapMenu, {
      session,
      contextualSection: createElement('div', { 'data-tracking': '' }),
    }),
  );
  expect(menu).toContain('aria-label="Mapper — account menu"');
  expect(menu).toContain('data-portrait="Mapper"');
  expect(menu).toContain('Manage characters');
  expect(menu).toContain('aria-label="Close menu"');
  expect(menu).toContain('Add character');
  expect(menu).toContain('Account settings');
  expect(menu).toMatch(/data-map-settings[^>]*><div data-tracking/);
  expect(menu).toContain('Log out');
  expect(menu).not.toContain('>Admin<');
  expect(menu.indexOf('data-tracking')).toBeLessThan(menu.indexOf('Log out'));
  expect(menu).not.toContain('Copy map link');

  mocks.isAdmin = true;
  expect(renderToStaticMarkup(createElement(MapMenu, { session }))).toContain('>Admin<');

  mocks.search = 'map=map-a';
  expect(renderToStaticMarkup(createElement(MapMenu, { session }))).toContain('Copy map link');
});

test('signed-out and unavailable listings hide the rows that do not apply', () => {
  mocks.isAdmin = false;
  mocks.search = '';
  const signedOut = renderToStaticMarkup(createElement(MapMenu, { session: null }));
  expect(signedOut).toContain('aria-label="Atlas menu"');
  expect(signedOut).not.toContain('data-portrait');
  expect(signedOut).not.toContain('Log out');
  expect(signedOut).toContain('New map');

  const unavailable = renderToStaticMarkup(
    createElement(MapMenu, { session, mapActionsAvailable: false }),
  );
  expect(unavailable).not.toContain('New map');
  expect(unavailable).toContain('>Maps<');
  expect(unavailable).toContain('data-map-creation-open="false"');
});
