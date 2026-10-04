import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCodexPage: vi.fn(),
  getFullSession: vi.fn(),
  adminArticle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/features/codex/queries', () => ({
  loadCodexPage: (subject: unknown) => mocks.loadCodexPage(subject),
}));
vi.mock('@/composition/session', () => ({ getFullSession: () => mocks.getFullSession() }));
vi.mock('@/features/codex/components/CodexAdminArticle', () => ({
  CodexAdminArticle: (props: Record<string, unknown>) => {
    mocks.adminArticle(props);
    return createElement('div', { 'data-admin-article': '' });
  },
}));

import CodexAdminSubjectPage, { CodexAdminReader, generateMetadata } from './page';

const params = (kind: string, key: string) => Promise.resolve({ kind, key });
const query = (values: Record<string, string> = {}) => Promise.resolve(values);
const renderReader = async (kind: string, key: string, values: Record<string, string> = {}) =>
  renderToStaticMarkup(await CodexAdminReader({ params: params(kind, key), searchParams: query(values) }));

const page = {
  title: 'Rolling a C3 static',
  updatedAt: new Date('2026-10-01T23:30:00Z'),
  revisionId: 'rev-2',
  doc: {
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [
      { type: 'paragraph', attrs: { id: 'intro' }, content: [{ type: 'text', text: 'Start here.', marks: [] }] },
      { type: 'heading', attrs: { id: 'ships', level: 2 }, content: [{ type: 'text', text: 'Ships', marks: [] }] },
      { type: 'heading', attrs: { id: 'route', level: 2 }, content: [{ type: 'text', text: 'Route', marks: [] }] },
    ],
  },
};

beforeEach(() => {
  mocks.loadCodexPage.mockReset();
  mocks.adminArticle.mockReset();
  mocks.getFullSession.mockReset().mockResolvedValue(null);
});

test('a viewer who is not the admin gets the plain reader', async () => {
  mocks.loadCodexPage.mockResolvedValue(page);
  expect(
    renderToStaticMarkup(CodexAdminSubjectPage({ params: params('guides', 'rolling-a-c3'), searchParams: query() })),
  ).toContain('aria-label="Loading page"');

  const html = renderToStaticMarkup(
    await CodexAdminReader({ params: params('guides', 'rolling-a-c3'), searchParams: query() }),
  );

  expect(mocks.loadCodexPage).toHaveBeenCalledWith({ kind: 'guides', key: 'rolling-a-c3' });
  const breadcrumb = /<nav aria-label="Breadcrumb"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? '';
  expect(/<a [^>]*>/.exec(breadcrumb)?.[0]).toContain('href="/codex"');
  expect(breadcrumb.replace(/<[^>]+>/g, '')).toBe('Codex/Guides/Rolling a C3 static');
  expect(html).toContain('Updated 1 October 2026');
  expect(html).toContain('<section id="ships"');
  expect(html).toContain('href="#ships"');
  expect(html).toContain('href="#route"');
  expect(html).toContain('<p>Start here.</p>');
  expect(html).not.toContain('Edit page');
  expect(mocks.adminArticle).not.toHaveBeenCalled();

  expect(
    await generateMetadata({ params: params('guides', 'rolling-a-c3'), searchParams: query() }),
  ).toMatchObject({
    title: 'Rolling a C3 static',
    alternates: { canonical: '/codex/guides/rolling-a-c3' },
  });

  mocks.loadCodexPage.mockClear();
  for (const [kind, key] of [['unknown-kind', 'x'], ['guides', 'Bad Slug'], ['constructor', 'x']] as const) {
    await expect(CodexAdminReader({ params: params(kind, key), searchParams: query() })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  }
  expect(mocks.loadCodexPage).not.toHaveBeenCalled();

  mocks.loadCodexPage.mockResolvedValue(null);
  await expect(
    CodexAdminReader({ params: params('guides', 'missing'), searchParams: query({ title: 'Sneaky' }) }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
});

test('the admin gets the editable article, opened on the section the address names', async () => {
  mocks.getFullSession.mockResolvedValue({ isAdmin: true });
  mocks.loadCodexPage.mockResolvedValue(page);

  await renderReader('guides', 'rolling-a-c3', { edit: 'ships', notice: 'conflict' });
  expect(mocks.adminArticle).toHaveBeenLastCalledWith(
    expect.objectContaining({
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      newTitle: null,
      baseRevisionId: 'rev-2',
      initialScope: 'ships',
      initialNotice: 'conflict',
    }),
  );
  const { sections } = mocks.adminArticle.mock.lastCall![0] as { sections: { id: string }[] };
  expect(sections.map((section) => section.id)).toEqual(['lead', 'ships', 'route']);

  await renderReader('guides', 'rolling-a-c3', { edit: 'gone' });
  expect(mocks.adminArticle).toHaveBeenLastCalledWith(
    expect.objectContaining({ initialScope: null, initialNotice: null, goneSectionId: null }),
  );

  await renderReader('guides', 'rolling-a-c3', { edit: 'gone', notice: 'conflict' });
  expect(mocks.adminArticle).toHaveBeenLastCalledWith(
    expect.objectContaining({ initialScope: 'page', initialNotice: 'conflict', goneSectionId: 'gone' }),
  );

  const taken = await renderReader('guides', 'rolling-a-c3', { title: 'Other' });
  expect(taken).toContain('A page already lives at this address');
});

test('the admin starts a new guide from a title on an empty address', async () => {
  mocks.getFullSession.mockResolvedValue({ isAdmin: true });
  mocks.loadCodexPage.mockResolvedValue(null);

  await renderReader('guides', 'new-one', { title: 'New one' });
  expect(mocks.adminArticle).toHaveBeenLastCalledWith(
    expect.objectContaining({
      newTitle: 'New one',
      baseRevisionId: null,
      sections: [],
      initialScope: 'page',
      initialNotice: null,
    }),
  );
  expect(
    await generateMetadata({ params: params('guides', 'new-one'), searchParams: query({ title: 'New one' }) }),
  ).toMatchObject({ title: 'New one' });
  await expect(
    CodexAdminReader({ params: params('guides', 'new-one'), searchParams: query() }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
});
