import { createElement, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  proposals: [] as unknown[],
  listedFor: [] as string[],
}));

vi.mock('@/composition/session', () => ({ getFullSession: async () => mocks.session }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/features/codex/proposals', () => ({
  listCodexProposalsBy: async (userId: string) => {
    mocks.listedFor.push(userId);
    return mocks.proposals;
  },
  readCodexRevisionDocs: async () => new Map(),
}));
vi.mock('@/composition/codex-templates', () => ({ codexTemplate: async () => null }));

import MySuggestionsPage, { metadata } from './page';

const suggestion = (id: string, status: string, reviewNote: string | null = null) => ({
  id,
  subject: { kind: 'guides', key: 'rolling-a-c3' },
  pageTitle: 'Rolling a C3 static',
  sectionId: 'lead',
  baseRevisionId: 'rev-1',
  headRevisionId: 'rev-1',
  blocks: [],
  summary: `Summary ${id}`,
  status,
  reviewNote,
  createdAt: new Date(),
  character: { id: 9001, name: 'Karaka' },
});

async function render(notice?: string): Promise<string> {
  const { prelude } = await prerender(
    createElement(MySuggestionsPage, { searchParams: Promise.resolve(notice ? { notice } : {}) }),
  );
  return (await new Response(prelude).text()).replaceAll('<!-- -->', '');
}

const rowOf = (html: string, id: string) => new RegExp(`<li[^>]*>(?:(?!</li>).)*Summary ${id}(?:(?!</li>).)*</li>`).exec(html)?.[0] ?? '';

beforeEach(() => {
  mocks.session = { user: { id: 'u1' } };
  mocks.listedFor = [];
  mocks.proposals = [
    suggestion('a', 'pending'),
    suggestion('b', 'approved'),
    suggestion('c', 'denied', 'Wrong wave'),
    suggestion('d', 'withdrawn'),
  ];
});

test('the page stays out of search results', () => {
  expect(metadata).toEqual({ title: 'My Codex suggestions', robots: { index: false } });
});

test('a signed-out visitor is asked to sign in', async () => {
  mocks.session = null;
  const html = await render();
  expect(html).toContain('Sign in to see your suggestions.');
  expect(mocks.listedFor).toEqual([]);
});

test('each suggestion shows its review state, and only pending ones can be withdrawn', async () => {
  const html = await render('submitted');

  expect(mocks.listedFor).toEqual(['u1']);
  expect(html).toContain('Your suggestion was sent.');
  expect(rowOf(html, 'a')).toContain('Pending review');
  expect(rowOf(html, 'a')).toContain('name="action" value="withdraw"');
  expect(rowOf(html, 'b')).toContain('Published');
  expect(rowOf(html, 'c')).toContain('Denied');
  expect(rowOf(html, 'c')).toContain('Wrong wave');
  expect(rowOf(html, 'd')).toContain('Withdrawn');
  expect(html.match(/value="withdraw"/g)).toHaveLength(1);
  expect(rowOf(html, 'a')).toContain('href="/codex/guides/rolling-a-c3"');
  expect(rowOf(html, 'a')).toContain('Introduction');
});
