import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { SidePanel } from '@/components/ui/side-panel';

const location = vi.hoisted(() => ({
  params: new URLSearchParams(),
  pathname: '/industry',
  plannerHref: null as string | null,
  runEffects: false,
}));
const structuresPanel = vi.hoisted(() => ({ props: null as ComponentProps<typeof SidePanel> | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => location.params,
  usePathname: () => location.pathname,
}));
vi.mock('@/lib/client-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client-store')>()),
  useClientStore: (store: { get: () => unknown }) => location.plannerHref ?? store.get(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, transitionTypes: _types, ...props }: { href: string; children: ReactNode; transitionTypes?: string[] }) =>
    createElement('a', { ...props, href }, children),
}));
vi.mock('@/components/ui/side-panel', () => ({
  SidePanel: (props: ComponentProps<typeof SidePanel>) => {
    structuresPanel.props = props;
    return props.open ? createElement('aside', { role: 'dialog', 'aria-label': props.title }, props.children) : null;
  },
}));
// The stable React resolved by Vitest has no ViewTransition export.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: ReactNode }) => children,
  useEffect: (effect: () => void) => {
    if (location.runEffects) effect();
  },
}));

import { IndustryNav, IndustryNavFallback, RememberPlanner, StructuresDrawer } from './IndustryShell';

const tabs = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>([^<]*)/g)].map(([, attrs, label]) => ({
    label,
    href: /href="([^"]*)"/.exec(attrs ?? '')?.[1],
    current: (attrs ?? '').includes('aria-current="page"'),
  }));

beforeEach(() => {
  location.plannerHref = null;
  location.runEffects = false;
});

test.each([
  ['/industry', 'Profiles'],
  ['/industry/planner', 'Planner'],
  ['/industry/2049', 'Planner'],
  ['/industry/jobs', 'Active jobs'],
])('the section tabs are links, and %s marks %s as the current one', (pathname, current) => {
  location.pathname = pathname;
  const links = tabs(renderToStaticMarkup(createElement(IndustryNav)));
  expect(links.map((l) => [l.label, l.href])).toEqual([
    ['Profiles', '/industry'],
    // With no blueprint opened yet, the planner opens on its search.
    ['Planner', '/industry/planner'],
    ['Active jobs', '/industry/jobs'],
  ]);
  expect(links.filter((l) => l.current).map((l) => l.label)).toEqual([current]);
});

test('the static shell carries the tabs before the route is known, none of them current', () => {
  const links = tabs(renderToStaticMarkup(createElement(IndustryNavFallback)));
  expect(links.map((l) => l.label)).toEqual(['Profiles', 'Planner', 'Active jobs']);
  expect(links.some((l) => l.current)).toBe(false);
});

test.each([
  ['/industry', '/industry/683'],
  ['/industry/jobs', '/industry/683'],
  // Inside the planner its own tab goes back to the search.
  ['/industry/683', '/industry/planner'],
  ['/industry/planner', '/industry/planner'],
])('after a blueprint opens, the Planner tab on %s goes to %s, and there is no separate search tab', (pathname, href) => {
  location.pathname = pathname;
  location.plannerHref = '/industry/683';
  const links = tabs(renderToStaticMarkup(createElement(IndustryNav)));
  expect(links.map((l) => l.label)).toEqual(['Profiles', 'Planner', 'Active jobs']);
  expect(links.find((link) => link.label === 'Planner')?.href).toBe(href);
});

test('the Planner tab returns to the blueprint last opened, or to the search when that was left last', () => {
  location.pathname = '/industry';
  location.runEffects = true;
  const plannerHref = () => tabs(renderToStaticMarkup(createElement(IndustryNav))).find((l) => l.label === 'Planner')?.href;
  renderToStaticMarkup(createElement(RememberPlanner, { blueprintTypeId: 683 }));
  expect(plannerHref()).toBe('/industry/683');
  renderToStaticMarkup(createElement(RememberPlanner));
  expect(plannerHref()).toBe('/industry/planner');
});

const drawer = () => renderToStaticMarkup(createElement(StructuresDrawer, null, 'Structures editor contents'));

test('a structures panel deep link opens over any section and closes without losing filters or hash', () => {
  location.params = new URLSearchParams('panel=structures&profile=caps&character=9001&filter=ready&filter=active');
  const pushState = vi.fn();
  vi.stubGlobal('window', {
    location: { href: `https://example.test/industry/jobs?${location.params}#queue` },
    history: { pushState },
  });
  try {
    const html = drawer();
    expect(html).toContain('Structures editor contents');
    expect(html).not.toContain('data-structures-trigger');
    expect(structuresPanel.props).toMatchObject({ open: true, title: 'Structures' });

    structuresPanel.props?.onOpenChange(false);
    const closed = new URL(pushState.mock.lastCall?.[2] ?? '', 'https://example.test');
    expect(closed.searchParams.has('panel')).toBe(false);
    expect(closed.pathname).toBe('/industry/jobs');
    expect(closed.searchParams.get('profile')).toBe('caps');
    expect(closed.searchParams.get('character')).toBe('9001');
    expect(closed.searchParams.getAll('filter')).toEqual(['ready', 'active']);
    expect(closed.hash).toBe('#queue');

    structuresPanel.props?.onOpenChange(true);
    const reopened = new URL(pushState.mock.lastCall?.[2] ?? '', 'https://example.test');
    expect(reopened.searchParams.getAll('panel')).toEqual(['structures']);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('an unrecognized panel query does not mount the structures editor', () => {
  location.params = new URLSearchParams('panel=unknown');
  structuresPanel.props = null;
  const html = drawer();
  expect(html).toBe('');
  expect(structuresPanel.props).toBeNull();
});

test('closing structures restores its visible facilities trigger and otherwise uses modal focus restoration', () => {
  location.params = new URLSearchParams('panel=structures');
  drawer();
  const getClientRects = vi.fn(() => [{}]);
  const trigger = { getClientRects } as unknown as HTMLButtonElement;
  const querySelector = vi.fn((): HTMLButtonElement | null => trigger);
  vi.stubGlobal('document', { querySelector });
  try {
    const finalFocus = structuresPanel.props?.finalFocus;
    expect(typeof finalFocus).toBe('function');
    if (typeof finalFocus !== 'function') throw new Error('Missing panel focus restoration');
    expect(finalFocus('keyboard')).toBe(trigger);
    expect(querySelector).toHaveBeenCalledWith('[data-structures-trigger]');
    getClientRects.mockReturnValue([]);
    expect(finalFocus('keyboard')).toBe(true);
    querySelector.mockReturnValue(null);
    expect(finalFocus('keyboard')).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
