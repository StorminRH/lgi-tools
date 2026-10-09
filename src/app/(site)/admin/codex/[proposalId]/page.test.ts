import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loaded: null as unknown,
  assetViewers: [] as unknown[],
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => ({ isAdmin: true }) }));
vi.mock('@/composition/codex-merge-review', () => ({ loadCodexProposalMerge: async () => mocks.loaded }));
vi.mock('@/composition/codex-sources', () => ({ codexSourceCatalogue: () => ({ sources: [] }) }));
vi.mock('@/features/codex/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/codex/assets')>()),
  loadCodexAssetViews: async (ids: readonly string[], viewer: unknown) => {
    mocks.assetViewers.push(viewer);
    return new Map(
      ids.map((id) => [
        id,
        { id, stem: `https://blob.test/codex/img/${id}`, width: 1920, height: 1080, status: 'pending', credit: 'Karaka Haginen' },
      ]),
    );
  },
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('span', { 'data-portrait': name }),
}));

import { parseCodexDoc } from '@/features/codex/doc';
import { mergeCodexDocs } from '@/features/codex/merge';
import CodexMergeReviewPage, { MergeReview } from './page';

const P1 = '33333333-3333-4333-8333-333333333333';
const text = (id: string, value: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text: value }] });
const heading = { type: 'heading', attrs: { id: 'strategy', level: 2 }, content: [{ type: 'text', text: 'Strategy' }] };
const doc = (...blocks: unknown[]) => {
  const parsed = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content: blocks });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return parsed.doc;
};
const base = doc(heading, text('s1', 'Warp in at 30 km.'));

function loaded(headBlocks: unknown[], status = 'pending', proposalBlocks: unknown[] = [text('s1', 'Warp in at 50 km.')]) {
  const head = doc(...headBlocks);
  const proposal = doc(heading, ...proposalBlocks);
  return {
    proposal: {
      id: P1,
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      pageTitle: 'Rolling a C3 static',
      sectionId: 'strategy',
      baseRevisionId: 'rev-1',
      headRevisionId: 'rev-2',
      blocks: proposal.content.slice(1),
      summary: 'Fix range',
      status,
      reviewNote: null,
      createdAt: new Date(Date.now() - 3 * 3_600_000),
      character: { id: 9001, name: 'Karaka Haginen' },
    },
    headRevisionId: 'rev-2',
    merge: mergeCodexDocs(base, head, proposal),
  };
}

const params = (proposalId: string) => Promise.resolve({ proposalId });
const query = (notice?: string, page?: string) =>
  Promise.resolve({ ...(notice ? { notice } : {}), ...(page ? { page } : {}) });

async function render(notice?: string, page?: string): Promise<string> {
  const { prelude } = await prerender(
    createElement(CodexMergeReviewPage, { params: params(P1), searchParams: query(notice, page) }),
  );
  return (await new Response(prelude).text()).replaceAll('<!-- -->', '');
}

beforeEach(() => {
  mocks.notFound.mockClear();
});

test('a conflicting paragraph shows base, page now, and suggestion with a choice per block', async () => {
  mocks.loaded = loaded([heading, text('s1', 'Warp in at 40 km.')]);
  const html = await render();

  expect(html).toContain('Review a suggestion');
  expect(html).toContain('data-portrait="Karaka Haginen"');
  expect(html).toContain('href="/codex/guides/rolling-a-c3"');
  expect(html).toContain('Strategy');
  expect(html).toContain('“Fix range”');
  expect(html).toContain('1 block to settle');
  expect(html).toContain('Base');
  expect(html).toContain('Page now');
  expect(html).toContain('Suggestion');
  expect(html).toContain('Warp in at 30 km.');
  expect(html).toContain('40');
  expect(html).toContain('50');
  expect(html).toContain('aria-label="Resolve s1"');
  expect(html).toContain("Keep the page&#x27;s version");
  expect(html).toContain('Use the suggestion');
  expect(html).toContain('Edit it by hand');
  expect(html).toContain('<input type="hidden" name="proposalId" value="33333333-3333-4333-8333-333333333333"/>');
  expect(html).toContain('<input type="hidden" name="headRevisionId" value="rev-2"/>');
  expect(html).not.toContain('name="choice.s1"');
  expect(html).toContain('Approve and publish');
  expect(html).not.toContain('Merges cleanly');
});

test('a block the page removed offers to leave it out, and a block both sides added has no original', async () => {
  mocks.loaded = loaded([heading]);
  const removed = await render();
  expect(removed).toContain('Leave it out (the page removed it)');
  expect(removed).not.toContain('Not in the original');

  mocks.loaded = loaded([heading, text('s1', 'Warp in at 30 km.'), text('x', 'Admin add.')], 'pending', [
    text('s1', 'Warp in at 30 km.'),
    text('x', 'Pilot add.'),
  ]);
  const added = await render();
  expect(added).toContain('aria-label="Resolve x"');
  expect(added).toContain('Not in the original');
  expect(added).toContain('Admin add.');
  expect(added).toContain('Pilot add.');
});

test('a clean merge offers one-click approval', async () => {
  mocks.loaded = loaded([text('lead', 'New lead.'), heading, text('s1', 'Warp in at 30 km.')]);
  const html = await render();
  expect(html).toContain('Merges cleanly');
  expect(html).not.toContain('Resolve');
  expect(html).toContain('Approve and publish');
});

test('a reviewed suggestion shows its status and no form', async () => {
  mocks.loaded = loaded([heading, text('s1', 'Warp in at 40 km.')], 'approved');
  const html = await render();
  expect(html).toContain('Published');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Approve and publish');
});

test('each notice explains what happened', async () => {
  mocks.loaded = loaded([heading, text('s1', 'Warp in at 40 km.')]);
  expect(await render('moved')).toContain('The page changed while you were reviewing, so nothing was published.');
  expect(await render('invalid')).toContain('An edited block did not pass the page checks');
  expect(await render('conflict')).toContain('Pick a version for every block below, then approve.');
  expect(await render('bogus')).not.toContain('role="status"');
});

test('an unknown or malformed id is not found', async () => {
  mocks.loaded = null;
  await expect(
    (async () => renderToStaticMarkup(await MergeReview({ params: params(P1), searchParams: query() })))(),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  mocks.loaded = loaded([heading]);
  await expect(
    (async () => renderToStaticMarkup(await MergeReview({ params: params('not-a-uuid'), searchParams: query() })))(),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.notFound).toHaveBeenCalledTimes(2);
});

test('the way back to the queue keeps the page the admin came from', async () => {
  mocks.loaded = loaded([heading, text('s1', 'Warp in at 40 km.')]);
  const later = await render(undefined, '3');
  expect(later).toContain('href="/admin/codex?page=3"');
  expect(later).toContain('<input type="hidden" name="page" value="3"/>');
  const first = await render();
  expect(first).toContain('href="/admin/codex"');
  expect(first).not.toContain('name="page"');
});

test('screenshots in a conflict render for the admin, pending ones included', async () => {
  const BASE_ASSET = '44444444-4444-4444-8444-444444444444';
  const HEAD_ASSET = '55555555-5555-4555-8555-555555555555';
  const SUGGESTED_ASSET = '66666666-6666-4666-8666-666666666666';
  const image = (assetId: string, caption: string) => ({
    type: 'image',
    attrs: { id: 'shot', assetId, alt: 'The C3 static in scan', caption },
  });
  mocks.assetViewers = [];
  const merge = mergeCodexDocs(
    doc(heading, image(BASE_ASSET, 'Original')),
    doc(heading, image(HEAD_ASSET, 'Page now')),
    doc(heading, image(SUGGESTED_ASSET, 'Suggested')),
  );
  mocks.loaded = { ...(loaded([heading]) as object), merge };
  const html = await render();

  expect(mocks.assetViewers).toEqual([{ kind: 'admin' }]);
  expect(html).not.toContain('Image unavailable');
  expect(html).toContain(`codex/img/${BASE_ASSET}`);
  expect(html).toContain('Original');
  expect(html).toContain('Screenshot · awaiting review');
  expect(html).toContain(`assetId: <del`);
});

test('videos in a conflict show the original as a player facade and each side as a change', async () => {
  const video = (videoId: string, title: string) => ({ type: 'video', attrs: { id: 'clip', provider: 'youtube', videoId, title } });
  const merge = mergeCodexDocs(
    doc(heading, video('dQw4w9WgXcQ', 'Full clear')),
    doc(heading, video('aBcDeFgHiJk', 'Page now')),
    doc(heading),
  );
  mocks.loaded = { ...(loaded([heading]) as object), merge };
  const html = await render();

  expect(html).toContain('aria-label="Play Full clear (loads YouTube)"');
  expect(html).toContain('src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"');
  expect(html).toContain('videoId: <del');
  expect(html).toContain('>aBcDeFgHiJk</ins>');
  expect(html).toContain('Video: Full clear (youtube dQw4w9WgXcQ)</del>');
  expect(html).not.toContain('<iframe');
});
