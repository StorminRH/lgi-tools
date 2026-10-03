import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT ${target}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect: navigation.redirect }));

import JobsPage from '@/app/(site)/jobs/page';
import StructuresPage from '@/app/(site)/structures/page';
import BuildTemplatesPage from './templates/page';
import { WorkspaceRedirect } from './WorkspaceRedirect';

type Query = Record<string, string | string[] | undefined>;
type RedirectProps = { searchParams: Promise<Query> };

async function resolveRedirect(page: (props: RedirectProps) => ReactElement, query: Query) {
  // Resolve the async child behind Suspense as in the settings-page tests.
  const entry = page({ searchParams: Promise.resolve(query) }) as ReactElement<
    ComponentProps<typeof WorkspaceRedirect>, typeof WorkspaceRedirect
  >;
  const boundary = entry.type(entry.props) as ReactElement<{
    children: ReactElement<ComponentProps<typeof WorkspaceRedirect>, (props: ComponentProps<typeof WorkspaceRedirect>) => Promise<ReactNode>>;
  }>;
  const content = boundary.props.children;
  return content.type(content.props);
}

const LEGACY_QUERY: Query = {
  profile: 'caps',
  character: '9001',
  filter: ['ready', 'active'],
  search: 'Rifter & parts',
  tab: 'obsolete',
  omitted: undefined,
};

function expectKeptQuery(destination: URL) {
  expect(destination.searchParams.get('profile')).toBe('caps');
  expect(destination.searchParams.get('character')).toBe('9001');
  expect(destination.searchParams.getAll('filter')).toEqual(['ready', 'active']);
  expect(destination.searchParams.get('search')).toBe('Rifter & parts');
  expect(destination.searchParams.has('omitted')).toBe(false);
  // Sections have their own paths now, so the old section query is dropped.
  expect(destination.searchParams.has('tab')).toBe(false);
}

test.each([
  ['/jobs', JobsPage, '/industry/jobs'],
  ['/industry/templates', BuildTemplatesPage, '/industry'],
] as const)('the legacy %s route redirects to its section and keeps its query values', async (_route, page, path) => {
  navigation.redirect.mockClear();
  await expect(resolveRedirect(page, LEGACY_QUERY)).rejects.toThrow(`NEXT_REDIRECT ${path}?`);
  expect(navigation.redirect).toHaveBeenCalledTimes(1);
  const destination = new URL(navigation.redirect.mock.lastCall?.[0] ?? '', 'https://example.test');
  expect(destination.pathname).toBe(path);
  expectKeptQuery(destination);

  await expect(resolveRedirect(page, {})).rejects.toThrow(new RegExp(`NEXT_REDIRECT ${path}$`));
});

test('the legacy structures route opens the drawer over the workspace and keeps its query values', async () => {
  navigation.redirect.mockClear();
  await expect(resolveRedirect(StructuresPage, { ...LEGACY_QUERY, panel: 'obsolete' })).rejects.toThrow(
    'NEXT_REDIRECT /industry?',
  );
  const destination = new URL(navigation.redirect.mock.lastCall?.[0] ?? '', 'https://example.test');
  expect(destination.pathname).toBe('/industry');
  expect(destination.searchParams.getAll('panel')).toEqual(['structures']);
  expectKeptQuery(destination);

  await expect(resolveRedirect(StructuresPage, {})).rejects.toThrow('NEXT_REDIRECT /industry?panel=structures');
});
