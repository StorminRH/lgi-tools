import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { SidePanel } from '@/components/ui/side-panel';

const location = vi.hoisted(() => ({ params: new URLSearchParams() }));
const structuresPanel = vi.hoisted(() => ({ props: null as ComponentProps<typeof SidePanel> | null }));
vi.mock('next/navigation', () => ({ useSearchParams: () => location.params }));
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
}));

import { IndustryWorkspaceTabs } from './IndustryWorkspaceTabs';

test.each([
  ['', 'Profiles', 'Profile workspace contents'],
  ['tab=plans', 'Plans &amp; templates', 'Saved plans contents'],
  ['tab=jobs&profile=caps&character=9001', 'Active jobs', 'Active jobs contents'],
  ['tab=invalid', 'Profiles', 'Profile workspace contents'],
])('industry tab query %s selects %s and mounts only its contents', (query, selected, contents) => {
  location.params = new URLSearchParams(query);
  const html = renderToStaticMarkup(createElement(IndustryWorkspaceTabs, {
    profiles: 'Profile workspace contents',
    plans: 'Saved plans contents',
    jobs: 'Active jobs contents',
    customStructures: 'Structures editor contents',
  }));
  const active = html.match(/<button[^>]*aria-selected="true"[^>]*>([\s\S]*?)<\/button>/);
  expect(active?.[1]).toBe(selected);
  expect(html.match(/role="tab"/g)).toHaveLength(3);
  expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  for (const panel of ['Profile workspace contents', 'Saved plans contents', 'Active jobs contents']) {
    if (panel === contents) expect(html).toContain(panel);
    else expect(html).not.toContain(panel);
  }
  expect(html).not.toContain('<a ');
  expect(html).not.toContain('Structures editor contents');
});

test('a structures panel deep link preserves the selected jobs tab and closes without losing filters or hash', () => {
  location.params = new URLSearchParams('tab=jobs&panel=structures&profile=caps&character=9001&filter=ready&filter=active');
  const pushState = vi.fn();
  vi.stubGlobal('window', {
    location: { href: `https://example.test/industry?${location.params}#queue` },
    history: { pushState },
  });
  try {
    const html = renderToStaticMarkup(createElement(IndustryWorkspaceTabs, {
      profiles: 'Profile workspace contents',
      plans: 'Saved plans contents',
      jobs: 'Active jobs contents',
      customStructures: 'Structures editor contents',
    }));
    expect(html).toContain('Active jobs contents');
    expect(html).toContain('Structures editor contents');
    expect(html).not.toContain('data-structures-trigger');
    expect(structuresPanel.props).toMatchObject({ open: true, title: 'Structures' });

    structuresPanel.props?.onOpenChange(false);
    const closed = new URL(pushState.mock.lastCall?.[2] ?? '', 'https://example.test');
    expect(closed.searchParams.has('panel')).toBe(false);
    expect(closed.searchParams.get('tab')).toBe('jobs');
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
  const html = renderToStaticMarkup(createElement(IndustryWorkspaceTabs, {
    profiles: 'Profile workspace contents', plans: null, jobs: null,
    customStructures: 'Structures editor contents',
  }));
  expect(html).toContain('Profile workspace contents');
  expect(html).not.toContain('data-structures-trigger');
  expect(html).not.toContain('Structures editor contents');
  expect(structuresPanel.props).toBeNull();
});

test('closing structures restores its visible facilities trigger and otherwise uses modal focus restoration', () => {
  location.params = new URLSearchParams('panel=structures');
  renderToStaticMarkup(createElement(IndustryWorkspaceTabs, {
    profiles: null, plans: null, jobs: null, customStructures: 'Structures editor contents',
  }));
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
