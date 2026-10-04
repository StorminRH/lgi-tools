import { createElement, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  proposals: [] as unknown[],
  docs: new Map<string, unknown>(),
}));

vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => ({ isAdmin: true }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('span', { 'data-portrait': name }),
}));
vi.mock('@/features/codex/proposals', () => ({
  listPendingCodexProposals: async ({ limit, offset }: { limit: number; offset: number }) =>
    mocks.proposals.slice(offset, offset + limit),
  readCodexRevisionDocs: async () => mocks.docs,
  countPendingCodexProposals: async () => mocks.proposals.length,
}));
vi.mock('@/composition/codex-templates', () => ({ codexTemplate: async () => null }));

import CodexSuggestionsPage from './page';

const text = (id: string, value: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text: value, marks: [] }] });

const baseDoc = {
  type: 'doc',
  attrs: { schemaVersion: 1 },
  content: [
    { type: 'heading', attrs: { id: 'strategy', level: 2 }, content: [{ type: 'text', text: 'Strategy', marks: [] }] },
    text('s1', 'Warp in at 30 km.'),
  ],
};

const proposal = (headRevisionId: string, id = '33333333-3333-4333-8333-333333333333') => ({
  id,
  subject: { kind: 'guides', key: 'rolling-a-c3' },
  pageTitle: 'Rolling a C3 static',
  sectionId: 'strategy',
  baseRevisionId: 'rev-1',
  headRevisionId,
  blocks: [text('s1', 'Warp in at 50 km.')],
  summary: 'Fix range',
  status: 'pending',
  reviewNote: null,
  createdAt: new Date(Date.now() - 3 * 3_600_000),
  character: { id: 9001, name: 'Karaka Haginen' },
});

async function render(outcome?: string, page?: string): Promise<string> {
  const { prelude } = await prerender(
    createElement(CodexSuggestionsPage, {
      searchParams: Promise.resolve({ ...(outcome ? { outcome } : {}), ...(page ? { page } : {}) }),
    }),
  );
  return (await new Response(prelude).text()).replaceAll('<!-- -->', '');
}

beforeEach(() => {
  mocks.docs = new Map([['rev-1', baseDoc]]);
  mocks.proposals = [proposal('rev-1')];
});

test('a pending suggestion shows who, where, why, and a word diff with one review form', async () => {
  const html = await render();

  expect(html).toContain('Codex suggestions');
  expect(html).toContain('1 pending');
  expect(html).toContain('data-portrait="Karaka Haginen"');
  expect(html).toContain('suggested an edit to');
  expect(html).toContain('href="/codex/guides/rolling-a-c3"');
  expect(html).toContain('“Fix range”');
  expect(html).toContain('3h ago');
  expect(html).toContain('CC BY-SA 4.0 accepted');
  expect(/<del[^>]*>([^<]*)<\/del>/.exec(html)?.[1]).toBe('30');
  expect(/<ins[^>]*>([^<]*)<\/ins>/.exec(html)?.[1]).toBe('50');
  expect(html).toContain('<input type="hidden" name="proposalId" value="33333333-3333-4333-8333-333333333333"/>');
  expect(html).toContain('<input type="hidden" name="headRevisionId" value="rev-1"/>');
  expect(html).toContain('Approve and publish');
  expect(html).toContain('Note to Karaka');
  expect(html).not.toContain('Review merge');
});

test('a suggestion written against an older page links to its merge review', async () => {
  mocks.proposals = [proposal('rev-2')];
  const html = await render();
  expect(html).toContain('href="/admin/codex/33333333-3333-4333-8333-333333333333"');
  expect(html).toContain('Review merge');
  expect(html).toContain('<input type="hidden" name="headRevisionId" value="rev-2"/>');
});

test('the review outcome and an empty queue read plainly', async () => {
  mocks.proposals = [];
  const html = await render('not-pending');
  expect(html).toContain('That suggestion was already reviewed or withdrawn.');
  expect(html).toContain('0 pending');
  expect(html).toContain('No suggestions are waiting for review.');
});

test('a long queue renders 25 suggestions a page with links between pages', async () => {
  mocks.proposals = Array.from({ length: 30 }, (_, index) => proposal('rev-1', `p-${index}`));
  const ids = (html: string) => [...html.matchAll(/name="proposalId" value="([^"]+)"/g)].map(([, id]) => id);

  const first = await render();
  expect(ids(first)).toEqual(Array.from({ length: 25 }, (_, index) => `p-${index}`));
  expect(first).toContain('30 pending');
  expect(first).toContain('href="/admin/codex?page=2"');

  const second = await render(undefined, '2');
  expect(ids(second)).toEqual(['p-25', 'p-26', 'p-27', 'p-28', 'p-29']);
  expect(second).toContain('href="/admin/codex?page=1"');
  expect(ids(await render(undefined, '9'))).toEqual(['p-25', 'p-26', 'p-27', 'p-28', 'p-29']);
});

test('review links and forms on a later page send the admin back to that page', async () => {
  mocks.proposals = [...Array.from({ length: 25 }, (_, index) => proposal('rev-1', `p-${index}`)), proposal('rev-2', 'p-25')];
  const second = await render(undefined, '2');
  expect(second).toContain('href="/admin/codex/p-25?page=2"');
  expect(second).toContain('<input type="hidden" name="page" value="2"/>');
  expect(await render()).not.toContain('name="page"');
});
