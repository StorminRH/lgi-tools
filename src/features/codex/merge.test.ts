import { expect, test } from 'vitest';
import { parseCodexDoc, type CodexBlockNode, type CodexDoc } from './doc';
import { mergeCodexDocs, proposalDocument, resolveCodexMerge, type CodexMerge } from './merge';

const p = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const h = (id: string, text: string) => ({ type: 'heading', attrs: { id, level: 2 }, content: [{ type: 'text', text }] });
const list = (id: string, items: Record<string, string>) => ({
  type: 'bulletList',
  attrs: { id },
  content: Object.entries(items).map(([itemId, text]) => ({
    type: 'listItem',
    attrs: { id: itemId },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })),
});

function doc(...blocks: unknown[]): CodexDoc {
  const parsed = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content: blocks });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return parsed.doc;
}

const block = (id: string, text: string) => doc(p(id, text)).content[0]!;
const ids = (blocks: readonly unknown[]) =>
  blocks.map((entry) => (entry as { attrs: { id?: string } }).attrs.id);
const texts = (blocks: readonly CodexBlockNode[]) =>
  Object.fromEntries(blocks.map((entry) => [ids([entry])[0], (entry.content[0] as { text: string }).text]));

const BASE = doc(p('a', 'A'), h('s', 'S'), p('b', 'B'), p('c', 'C'));
const [A, S, B, C] = BASE.content as [CodexBlockNode, CodexBlockNode, CodexBlockNode, CodexBlockNode];

const conflictOn = (
  blockId: string,
  base: CodexBlockNode | null,
  head: CodexBlockNode | null,
  proposal: CodexBlockNode | null,
) => ({ kind: 'conflict', conflicts: [{ blockId, base, head, proposal }] });

test.each([
  {
    name: 'disjoint edits both land',
    head: doc(p('a', 'A2'), S, B, C),
    proposal: doc(A, S, p('b', 'B2'), C),
    expected: { kind: 'clean', ids: ['a', 's', 'b', 'c'], texts: { a: 'A2', b: 'B2' } },
  },
  {
    name: 'the same edit on both sides is clean',
    head: doc(A, S, p('b', 'B2'), C),
    proposal: doc(A, S, p('b', 'B2'), C),
    expected: { kind: 'clean', ids: ['a', 's', 'b', 'c'], texts: { b: 'B2' } },
  },
  {
    name: 'different edits to one block conflict and the page keeps its text',
    head: doc(A, S, p('b', 'B-head'), C),
    proposal: doc(A, S, p('b', 'B-prop'), C),
    expected: {
      ...conflictOn('b', B, block('b', 'B-head'), block('b', 'B-prop')),
      ids: ['a', 's', 'b', 'c'],
      texts: { b: 'B-head' },
    },
  },
  {
    name: 'a block the proposal edited and the page deleted conflicts',
    head: doc(A, S, C),
    proposal: doc(A, S, p('b', 'B2'), C),
    expected: { ...conflictOn('b', B, null, block('b', 'B2')), ids: ['a', 's', 'b', 'c'] },
  },
  {
    name: 'a page deletion the proposal did not touch stays deleted',
    head: doc(A, S, C),
    proposal: BASE,
    expected: { kind: 'clean', ids: ['a', 's', 'c'] },
  },
  {
    name: 'a proposal deletion the page did not touch is taken',
    head: BASE,
    proposal: doc(A, S, C),
    expected: { kind: 'clean', ids: ['a', 's', 'c'] },
  },
  {
    name: 'a block the page edited and the proposal deleted conflicts',
    head: doc(A, S, p('b', 'B-head'), C),
    proposal: doc(A, S, C),
    expected: { ...conflictOn('b', B, block('b', 'B-head'), null), ids: ['a', 's', 'b', 'c'] },
  },
  {
    name: 'both deleting one block is clean',
    head: doc(A, S, C),
    proposal: doc(A, S, C),
    expected: { kind: 'clean', ids: ['a', 's', 'c'] },
  },
  {
    name: 'an insert follows its anchor after the page moved that anchor',
    head: doc(A, S, C, B),
    proposal: doc(A, S, B, p('x', 'X'), C),
    expected: { kind: 'clean', ids: ['a', 's', 'c', 'b', 'x'] },
  },
  {
    name: 'an insert after a block the page deleted lands at the nearest surviving anchor',
    head: doc(A, S, C),
    proposal: doc(A, S, B, p('x', 'X'), C),
    expected: { kind: 'clean', ids: ['a', 's', 'x', 'c'] },
  },
  {
    name: 'two inserts at one anchor keep a stable order',
    head: doc(A, p('z', 'Z'), S, B, C),
    proposal: doc(A, p('x', 'X'), p('y', 'Y'), S, B, C),
    expected: { kind: 'clean', ids: ['a', 'x', 'y', 'z', 's', 'b', 'c'] },
  },
  {
    name: 'an insert at the top of an unmoved page leads',
    head: BASE,
    proposal: doc(p('x', 'X'), A, S, B, C),
    expected: { kind: 'clean', ids: ['x', 'a', 's', 'b', 'c'] },
  },
  {
    name: 'an insert after a deleted lead lands at the top',
    head: doc(S, B, C),
    proposal: doc(A, p('x', 'X'), S, B, C),
    expected: { kind: 'clean', ids: ['x', 's', 'b', 'c'] },
  },
  {
    name: 'key order never fakes a change',
    head: {
      ...BASE,
      content: [A, S, { content: B.content, attrs: { ...B.attrs }, type: 'paragraph' } as CodexBlockNode, C],
    },
    proposal: doc(A, S, p('b', 'B2'), C),
    expected: { kind: 'clean', ids: ['a', 's', 'b', 'c'], texts: { b: 'B2' } },
  },
  {
    name: 'both sides adding the same block keep one copy',
    head: doc(A, S, B, C, p('x', 'X')),
    proposal: doc(A, S, B, C, p('x', 'X')),
    expected: { kind: 'clean', ids: ['a', 's', 'b', 'c', 'x'] },
  },
  {
    name: 'both sides adding different text under one id conflict',
    head: doc(A, S, B, C, p('x', 'X1')),
    proposal: doc(A, S, B, C, p('x', 'X2')),
    expected: { ...conflictOn('x', null, block('x', 'X1'), block('x', 'X2')), ids: ['a', 's', 'b', 'c', 'x'] },
  },
  {
    name: 'edits to different items of one list conflict as a whole block',
    base: doc(A, list('l', { i1: 'one', i2: 'two' })),
    head: doc(A, list('l', { i1: 'one!', i2: 'two' })),
    proposal: doc(A, list('l', { i1: 'one', i2: 'two!' })),
    expected: {
      ...conflictOn(
        'l',
        doc(list('l', { i1: 'one', i2: 'two' })).content[0]!,
        doc(list('l', { i1: 'one!', i2: 'two' })).content[0]!,
        doc(list('l', { i1: 'one', i2: 'two!' })).content[0]!,
      ),
      ids: ['a', 'l'],
    },
  },
])('$name', ({ base = BASE, head, proposal, expected }) => {
  const merge = mergeCodexDocs(base, head, proposal);
  expect(merge.kind).toBe(expected.kind);
  expect(ids(merge.doc.content)).toEqual(expected.ids);
  if ('conflicts' in expected) expect((merge as Extract<CodexMerge, { kind: 'conflict' }>).conflicts).toEqual(expected.conflicts);
  if (expected.texts) expect(texts(merge.doc.content)).toMatchObject(expected.texts);
});

test('a proposal against an unmoved page is the proposal exactly', () => {
  const proposal = doc(p('c', 'C2'), A, p('x', 'X'));
  expect(mergeCodexDocs(BASE, BASE, proposal)).toEqual({ kind: 'clean', doc: proposal });
});

test('proposalDocument swaps one section and refuses a section the base lacks', () => {
  expect(ids(proposalDocument(BASE, 's', [block('b', 'B2')])!.content)).toEqual(['a', 's', 'b']);
  expect(proposalDocument(BASE, 'nope', [])).toBeNull();
  expect(ids(proposalDocument(BASE, 'lead', [block('intro', 'Hi')])!.content)).toEqual(['intro', 's', 'b', 'c']);
});

test('resolving a conflict applies the admin choice per block', () => {
  const deleted = mergeCodexDocs(BASE, doc(A, S, C), doc(A, S, p('b', 'B2'), C));
  const B2 = block('b', 'B2');

  expect(resolveCodexMerge(deleted, { b: 'proposal' })).toEqual([A, S, B2, C]);
  expect(resolveCodexMerge(deleted, { b: 'head' })).toEqual([A, S, C]);
  expect(resolveCodexMerge(deleted, { b: [p('b', 'Hand')] })).toEqual([A, S, p('b', 'Hand'), C]);
  expect(resolveCodexMerge(deleted, {})).toBeNull();
  expect(resolveCodexMerge(deleted, { zzz: 'head' })).toBeNull();

  const clean = mergeCodexDocs(BASE, doc(p('a', 'A2'), S, B, C), doc(A, S, B2, C));
  expect(resolveCodexMerge(clean, {})).toEqual([block('a', 'A2'), S, B2, C]);
});

test('ids the editor adds to nested paragraphs are not a change', () => {
  const steps = (nestedId: string | null) => ({
    type: 'bulletList',
    attrs: { id: 'l' },
    content: [
      {
        type: 'listItem',
        attrs: { id: 'i' },
        content: [
          { type: 'paragraph', attrs: nestedId ? { id: nestedId } : {}, content: [{ type: 'text', text: 'Higgs anchor' }] },
        ],
      },
    ],
  });
  const merge = mergeCodexDocs(doc(A, S, steps(null)), doc(p('a', 'A2'), S, steps('n-head')), doc(A, S, steps('n-prop')));
  expect(merge).toEqual({ kind: 'clean', doc: doc(p('a', 'A2'), S, steps('n-head')) });
});
