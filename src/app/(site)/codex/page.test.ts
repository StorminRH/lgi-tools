import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listCodexEntries: vi.fn(),
  listRecentCodexEdits: vi.fn(),
  getFullSession: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/composition/codex-templates', () => ({ listCodexEntries: mocks.listCodexEntries }));
vi.mock('@/features/codex/queries', () => ({ listRecentCodexEdits: mocks.listRecentCodexEdits }));
vi.mock('@/composition/session', () => ({ getFullSession: mocks.getFullSession }));

import CodexAdminIndexPage, { metadata as adminMetadata } from './admin/page';
import { CodexIndex, CodexSearchResults, RecentEdits } from './codex-index';
import CodexIndexPage, { metadata } from './page';

const CLASS_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'thera', 'c13', 'sentinel', 'barbican', 'vidette', 'conflux', 'redoubt'];
const ENTRIES: Record<string, { key: string; title: string }[]> = {
  wormholes: [{ key: 'c247', title: 'C247' }],
  sites: [{ key: '20', title: 'Outpost Frontier Stronghold' }],
  classes: CLASS_KEYS.map((key) => ({ key, title: key.toUpperCase() })),
  guides: [{ key: 'rolling-a-c3', title: 'Rolling a C3 static' }],
};

const query = (values: Record<string, string> = {}) => Promise.resolve(values);

beforeEach(() => {
  mocks.listCodexEntries.mockReset().mockImplementation(async (kind: string) => ENTRIES[kind]);
  mocks.listRecentCodexEdits.mockReset().mockResolvedValue([]);
});

test('the index tiles each kind with its live count', async () => {
  expect(metadata.alternates?.canonical).toBe('/codex');
  const html = renderToStaticMarkup(await CodexIndex({ searchParams: query() }));

  for (const kind of ['wormholes', 'sites', 'classes', 'guides']) expect(html).toContain(`href="/codex/${kind}"`);
  expect(html).toContain('13 classes');
  expect(html).toContain('1 guide<');
  expect(html).toContain('action="/codex"');
  expect(html).toContain('name="q"');

  mocks.listCodexEntries.mockImplementation(async (kind: string) => (kind === 'guides' ? [] : ENTRIES[kind]));
  expect(renderToStaticMarkup(await CodexIndex({ searchParams: query() }))).toContain('0 guides');
});

test('the search lists matching titles across every kind', async () => {
  const hits = renderToStaticMarkup(await CodexSearchResults({ searchParams: query({ q: 'c24' }) }));
  expect(hits).toContain('href="/codex/wormholes/c247"');
  expect(hits).not.toContain('Outpost');

  expect(renderToStaticMarkup(await CodexSearchResults({ searchParams: query({ q: 'zzz' }) }))).toContain(
    'No matches for &quot;zzz&quot;.',
  );
  expect(await CodexSearchResults({ searchParams: query() })).toBeNull();
});

test('recent edits name the page, its kind, and who changed it', async () => {
  mocks.listRecentCodexEdits.mockResolvedValue([
    {
      kind: 'sites',
      key: '20',
      title: 'Outpost Frontier Stronghold',
      updatedAt: new Date('2026-10-03T10:00:00Z'),
      summary: 'Rewrote strategy',
      origin: 'admin',
      character: { id: 2123732314, name: 'Stormin Jr' },
    },
    {
      kind: 'guides',
      key: 'rolling-a-c3',
      title: 'Rolling a C3 static',
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      summary: null,
      origin: 'admin',
      character: null,
    },
  ]);
  const html = renderToStaticMarkup(await RecentEdits());

  expect(mocks.listRecentCodexEdits).toHaveBeenCalledWith(5);
  expect(html).toContain('href="/codex/sites/20"');
  expect(html).toContain('Outpost Frontier Stronghold');
  expect(html).toContain('>Site</span>');
  expect(html).toContain('Stormin Jr: Rewrote strategy');
  expect(html).toContain('alt="Stormin Jr"');
  expect(html).toContain('3 October 2026');
  expect(html).toContain('Unknown pilot edited this page');
});

async function renderPage(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

test('the search box keeps the submitted query above its results', async () => {
  const html = await renderPage(CodexIndexPage({ searchParams: query({ q: '  c247 ' }) }));
  expect(html).toMatch(/<input [^>]*name="q"[^>]*value="c247"/);
  expect(html).toContain('href="/codex/wormholes/c247"');
});

test('only the admin gets the New guide control, and only on the signed-in route', async () => {
  expect(adminMetadata).toBe(metadata);
  mocks.getFullSession.mockResolvedValue({ isAdmin: true });
  expect(await renderPage(CodexIndexPage({ searchParams: query() }))).not.toContain('New guide');
  expect(await renderPage(CodexAdminIndexPage({ searchParams: query() }))).toContain('New guide');

  mocks.getFullSession.mockResolvedValue({ isAdmin: false });
  const signedIn = await renderPage(CodexAdminIndexPage({ searchParams: query() }));
  expect(signedIn).toContain('href="/codex/guides"');
  expect(signedIn).not.toContain('New guide');
});
