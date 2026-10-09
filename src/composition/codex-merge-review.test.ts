import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  proposals: new Map<string, unknown>(),
  docs: new Map<string, unknown>(),
  template: null as unknown,
}));

vi.mock('@/features/codex/proposals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/codex/proposals')>();
  return {
    ...actual,
    readCodexProposal: async (id: string) => mocks.proposals.get(id) ?? null,
    readCodexRevisionDocs: async (ids: readonly string[]) =>
      new Map(ids.flatMap((id) => (mocks.docs.has(id) ? [[id, mocks.docs.get(id)] as const] : []))),
  };
});
vi.mock('@/composition/codex-templates', () => ({ codexTemplate: async () => mocks.template }));

import { parseCodexDoc, type CodexBlockNode } from '@/features/codex/doc';
import { loadCodexProposalMerge } from './codex-merge-review';

const P1 = '33333333-3333-4333-8333-333333333333';
const text = (id: string, value: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text: value }] });
const heading = (id: string, value: string) => ({
  type: 'heading',
  attrs: { id, level: 2 },
  content: [{ type: 'text', text: value }],
});
const doc = (...blocks: unknown[]) => {
  const parsed = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content: blocks });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return parsed.doc;
};
const proposal = (over: Record<string, unknown>) => ({
  id: P1,
  subject: { kind: 'guides', key: 'rolling-a-c3' },
  pageTitle: 'Rolling a C3 static',
  sectionId: 'strategy',
  baseRevisionId: 'rev-1',
  headRevisionId: 'rev-2',
  blocks: doc(text('s1', 'Warp in at 50 km.')).content,
  summary: 'Fix range',
  status: 'pending',
  reviewNote: null,
  createdAt: new Date(),
  character: { id: 9001, name: 'Tester' },
  ...over,
});
const ids = (blocks: readonly CodexBlockNode[]) => blocks.map((block) => ('id' in block.attrs ? block.attrs.id : null));

test('a suggestion on a revision merges against the current head', async () => {
  mocks.proposals = new Map([[P1, proposal({})]]);
  mocks.docs = new Map([
    ['rev-1', doc(text('lead', 'Start here.'), heading('strategy', 'Strategy'), text('s1', 'Warp in at 30 km.'))],
    ['rev-2', doc(text('lead', 'Start over here.'), heading('strategy', 'Strategy'), text('s1', 'Warp in at 40 km.'))],
  ]);

  const loaded = (await loadCodexProposalMerge(P1))!;
  expect(loaded.headRevisionId).toBe('rev-2');
  expect(loaded.merge.kind).toBe('conflict');
  if (loaded.merge.kind !== 'conflict') return;
  expect(loaded.merge.conflicts.map((conflict) => conflict.blockId)).toEqual(['s1']);
  expect(ids(loaded.merge.doc.content)).toEqual(['lead', 'strategy', 's1']);
  expect(JSON.stringify(loaded.merge.doc)).toContain('Start over here.');
});

test('a suggestion on an unwritten page merges against its template', async () => {
  mocks.proposals = new Map([
    [P1, proposal({ subject: { kind: 'wormholes', key: 'c247' }, sectionId: 'overview', baseRevisionId: null, headRevisionId: 'rev-9', blocks: doc(text('o1', 'Big.')).content })],
  ]);
  mocks.template = { title: 'C247', description: '', doc: doc(heading('overview', 'Overview'), { type: 'paragraph', attrs: { id: 'blank' }, content: [] }) };
  mocks.docs = new Map([['rev-9', doc(heading('overview', 'Overview'), text('o9', 'Admin text.'))]]);

  const loaded = (await loadCodexProposalMerge(P1))!;
  expect(loaded.merge.kind).toBe('clean');
  if (loaded.merge.kind !== 'clean') return;
  expect(ids(loaded.merge.doc.content)).toEqual(['overview', 'o1', 'o9']);

  mocks.template = null;
  expect((await loadCodexProposalMerge(P1))!.merge).toEqual({ kind: 'invalid', problems: ['template missing'] });
});

test('an unknown id loads nothing', async () => {
  mocks.proposals = new Map();
  expect(await loadCodexProposalMerge('99999999-9999-4999-8999-999999999999')).toBeNull();
});
