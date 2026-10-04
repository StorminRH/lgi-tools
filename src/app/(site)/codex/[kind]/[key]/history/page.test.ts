import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listCodexRevisions: vi.fn(),
  requireAdminPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));
vi.mock('@/composition/route-guards', () => ({ requireAdminPage: () => mocks.requireAdminPage() }));
vi.mock('@/features/codex/queries', () => ({
  listCodexRevisions: (subject: unknown) => mocks.listCodexRevisions(subject),
}));

import CodexHistoryPage, { CodexHistory, metadata } from './page';

const params = (kind: string, key: string) => Promise.resolve({ kind, key });
const query = (values: Record<string, string> = {}) => Promise.resolve(values);
const render = async (kind: string, key: string, values: Record<string, string> = {}) =>
  renderToStaticMarkup(await CodexHistory({ params: params(kind, key), searchParams: query(values) }));

const history = {
  title: 'Rolling a C3 static',
  revisions: [
    {
      id: 'rev-2',
      createdAt: new Date('2026-10-02T09:05:00Z'),
      origin: 'revert',
      summary: null,
      character: null,
      current: true,
    },
    {
      id: 'rev-1',
      createdAt: new Date('2026-10-01T18:30:00Z'),
      origin: 'admin',
      summary: 'First draft',
      character: { id: 90_000_001, name: 'Stormin Pilot' },
      current: false,
    },
  ],
};

beforeEach(() => {
  mocks.listCodexRevisions.mockReset().mockResolvedValue(history);
  mocks.requireAdminPage.mockReset().mockResolvedValue(undefined);
  mocks.notFound.mockClear();
});

test('history lists revisions newest first and offers restore on the older ones', async () => {
  expect(metadata).toEqual({ title: 'Page history', robots: { index: false } });
  expect(
    renderToStaticMarkup(CodexHistoryPage({ params: params('guides', 'rolling-a-c3'), searchParams: query() })),
  ).toContain('aria-label="Loading history"');

  const html = await render('guides', 'rolling-a-c3');

  expect(mocks.requireAdminPage).toHaveBeenCalled();
  expect(mocks.listCodexRevisions).toHaveBeenCalledWith({ kind: 'guides', key: 'rolling-a-c3' });
  expect(html).toContain('href="/codex/guides/rolling-a-c3"');
  expect(html).toContain('2 Oct 2026, 09:05');
  expect(html).toContain('Restored an earlier version');
  expect(html).toContain(
    '<span aria-hidden="true" class="size-7 shrink-0 rounded-full border border-border-idle bg-row-hover"></span><span class="text-muted">Unknown pilot</span>',
  );
  expect(html).toContain('First draft');
  expect(html).toContain('alt="Stormin Pilot"');
  expect(html.match(/name="revisionId"/g)).toHaveLength(1);
  expect(html).toContain('name="revisionId" value="rev-1"');
  expect(html).toContain('name="baseRevisionId" value="rev-2"');
  expect(html).not.toContain('nothing was restored');
});

test('history explains a refused restore', async () => {
  expect(await render('guides', 'rolling-a-c3', { notice: 'conflict' })).toContain(
    'The page changed while this history was open, so nothing was restored.',
  );
  expect(await render('guides', 'rolling-a-c3', { notice: 'invalid' })).toContain(
    'That version no longer passes the page checks, so it was not restored.',
  );
});

test('history 404s a bad address or a page that does not exist', async () => {
  await expect(render('guides', 'Bad Slug')).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.listCodexRevisions).not.toHaveBeenCalled();

  mocks.listCodexRevisions.mockResolvedValue(null);
  await expect(render('guides', 'missing')).rejects.toThrow('NEXT_NOT_FOUND');
});
