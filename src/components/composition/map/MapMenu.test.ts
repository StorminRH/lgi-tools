import { cloneElement, createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startCharacterLink } from '@/platform/auth/link-character';
import { MapMenu } from './MapMenu';

const mocks = vi.hoisted(() => ({
  isAdmin: false,
  search: '',
  states: [] as unknown[],
  cursor: 0,
  actions: new Map<string, (event: unknown) => void>(),
  creation: { open: false, onOpenChange: (_open: boolean) => {} },
}));

// Preserve state between static renders so real menu callbacks can drive the
// next render, without replacing the clipboard hook or its async write.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++;
    if (!(slot in mocks.states)) mocks.states[slot] = initial;
    return [mocks.states[slot], (next: unknown) => { mocks.states[slot] = next; }];
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('next/link', () => ({
  default: (props: { href: string; children?: ReactNode }) => createElement('a', props),
}));
vi.mock('@/components/ui/menu', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/menu')>(),
  Menu: ({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) =>
    createElement('div', { role: 'menu', 'aria-label': label }, trigger, children),
  MenuItem: ({ children, onClick, 'aria-label': label }: {
    children: ReactNode;
    onClick?: (event: unknown) => void;
    'aria-label'?: string;
  }) => {
    if (onClick) mocks.actions.set(renderToStaticMarkup(createElement('span', null, children)), onClick);
    return createElement('button', { 'aria-label': label }, children);
  },
  MenuLinkItem: ({ children, render, closeOnClick: _closeOnClick, ...props }: {
    children: ReactNode;
    render?: ReactElement;
    closeOnClick?: boolean;
  }) => render ? cloneElement(render, props, children) : createElement('a', props, children),
}));
vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));
vi.mock('@/components/composition/PageMenuSection', () => ({
  PageMenuSection: ({ children }: { children?: ReactNode }) =>
    createElement('section', { 'aria-label': 'Map settings' }, children),
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false, isAdmin: mocks.isAdmin }),
}));
vi.mock('@/platform/auth/link-character', () => ({ startCharacterLink: vi.fn() }));
vi.mock('@/platform/auth/auth-client', () => ({ authClient: { signOut: vi.fn() } }));
vi.mock('@/features/maps/MapCreationDialog', () => ({
  MapCreationDialog: (props: typeof mocks.creation) => {
    mocks.creation = props;
    return null;
  },
}));

const session = { characterId: 7, name: 'Mapper', portraitUrl: '/portrait.png', role: 'USER' as const };

function renderMenu(props: Partial<React.ComponentProps<typeof MapMenu>> = {}) {
  mocks.cursor = 0;
  mocks.actions.clear();
  return renderToStaticMarkup(createElement(MapMenu, { session, ...props }));
}

function click(label: string) {
  const action = [...mocks.actions].find(([text]) => text.includes(label))?.[1];
  if (!action) throw new Error('Missing menu action: ' + label);
  action({ currentTarget: null });
}

beforeEach(() => {
  mocks.states = [];
  mocks.isAdmin = false;
  mocks.search = '';
  vi.clearAllMocks();
  vi.stubGlobal('window', { location: { origin: 'https://lgi.tools' } });
});
afterEach(() => vi.unstubAllGlobals());

test('signed-in menu has a distinct Atlas label, correct links and contextual controls', () => {
  const markup = renderMenu({ contextualSection: createElement('button', null, 'Track Alice') });
  expect(markup).toContain('aria-label="Mapper — Atlas menu"');
  expect(markup).not.toContain('Mapper — account menu');
  expect(markup).toMatch(/<a[^>]*href="\/"[^>]*aria-label="LGI.tools home"/);
  expect(markup).toMatch(/<a[^>]*href="\/atlas"[^>]*>Maps<\/a>/);
  expect(markup).toContain('href="/settings/characters"');
  expect(markup).toContain('href="/settings/account"');
  expect(markup).toContain('aria-label="Close menu"');
  expect(markup).toContain('Track Alice');
  expect(markup).toContain('Log out');
  expect(markup).not.toContain('>Admin<');
  expect(markup).not.toContain('Copy map link');
  mocks.isAdmin = true;
  expect(renderMenu()).toContain('href="/admin"');
});
test('signed-out users keep map actions without account rows', () => {
  const markup = renderMenu({ session: null });
  expect(markup).toContain('aria-label="Atlas menu"');
  expect(markup).not.toContain('alt="Mapper"');
  expect(markup).not.toContain('Log out');
  expect(markup).not.toContain('Add character');
  expect(markup).toContain('New map');
});
test.each(['map/one', null])('Add character returns to the current Atlas map (%s)', (mapId) => {
  mocks.search = mapId ? new URLSearchParams({ map: mapId }).toString() : '';
  renderMenu();
  click('Add character');
  expect(startCharacterLink).toHaveBeenCalledWith(mapId ? '/atlas?map=map%2Fone' : '/atlas');
});
test('copy map link writes the absolute encoded URL and reports success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  mocks.search = 'map=map%2Fone';
  renderMenu();
  click('Copy map link');
  await vi.waitFor(() => expect(renderMenu()).toContain('Map link copied to clipboard'));
  expect(writeText).toHaveBeenCalledExactlyOnceWith('https://lgi.tools/atlas?map=map%2Fone');
  expect(renderMenu()).toContain('Link copied');
});
test.each(['missing', 'rejected'])('clipboard %s reports unavailable and allows retry', async (failure) => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  vi.stubGlobal('navigator', failure === 'missing' ? {} : { clipboard: { writeText } });
  mocks.search = 'map=map-a';
  renderMenu();
  click('Copy map link');
  await vi.waitFor(() => expect(renderMenu()).toContain('Clipboard unavailable; copy the map link from your address bar'));
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  click('Clipboard unavailable');
  await vi.waitFor(() => expect(renderMenu()).toContain('Link copied'));
});
test('losing map actions closes creation and restoring access does not reopen it', () => {
  renderMenu();
  click('New map');
  renderMenu();
  expect(mocks.creation.open).toBe(true);
  const unavailable = renderMenu({ mapActionsAvailable: false });
  expect(mocks.creation.open).toBe(false);
  expect(unavailable).not.toContain('New map');
  expect(unavailable).toContain('>Maps<');
  renderMenu();
  expect(mocks.creation.open).toBe(false);
  click('New map');
  renderMenu();
  mocks.creation.onOpenChange(false);
  renderMenu();
  expect(mocks.creation.open).toBe(false);
});
