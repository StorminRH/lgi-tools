import { expect, test } from 'vitest';
import type { CodexBlockNode } from './doc';
import { diffCodexBlocks, wordStats } from './diff';

const p = (id: string, text: string, marks: { type: 'bold'; attrs: object }[] = []): CodexBlockNode =>
  ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text, marks }] }) as CodexBlockNode;

const dataBlock = (fields: string[], layout: 'infobox' | 'table'): CodexBlockNode =>
  ({
    type: 'dataBlock',
    attrs: { id: 'd', source: 'wormholeType', key: 'c247', fields, layout },
    content: [],
  }) as CodexBlockNode;

test('an added block and a removed block carry their text', () => {
  expect(diffCodexBlocks([p('a', 'One')], [p('a', 'One'), p('b', 'Two')])).toEqual([
    { kind: 'added', id: 'b', text: 'Two' },
  ]);
  expect(diffCodexBlocks([p('a', 'One'), p('b', 'Two')], [p('a', 'One')])).toEqual([
    { kind: 'removed', id: 'b', text: 'Two' },
  ]);
  expect(wordStats(diffCodexBlocks([p('a', 'One two')], [p('b', 'Three')]))).toEqual({ added: 1, removed: 2 });
});

test('reordered blocks report where each one moved', () => {
  expect(diffCodexBlocks([p('a', 'A'), p('b', 'B'), p('c', 'C')], [p('b', 'B'), p('a', 'A'), p('c', 'C')])).toEqual([
    { kind: 'moved', id: 'a', from: 0, to: 1 },
    { kind: 'moved', id: 'b', from: 1, to: 0 },
  ]);
});

test('an edited paragraph diffs word by word', () => {
  const diff = diffCodexBlocks([p('a', 'Warp in at 30 km')], [p('a', 'Warp in at 50 km')]);
  expect(diff).toEqual([
    {
      kind: 'changed',
      id: 'a',
      words: [
        { op: 'same', text: 'Warp in at ' },
        { op: 'removed', text: '30' },
        { op: 'added', text: '50' },
        { op: 'same', text: ' km' },
      ],
    },
  ]);
  expect(wordStats(diff)).toEqual({ added: 1, removed: 1 });
});

test('a formatting-only edit and a data block edit are named as such', () => {
  expect(diffCodexBlocks([p('a', 'Warp')], [p('a', 'Warp', [{ type: 'bold', attrs: {} }])])).toEqual([
    { kind: 'changed', id: 'a', change: 'format' },
  ]);
  expect(diffCodexBlocks([dataBlock(['mass', 'lifetime'], 'infobox')], [dataBlock(['mass'], 'table')])).toEqual([
    {
      kind: 'changed',
      id: 'd',
      attrs: [
        { name: 'fields', before: 'mass, lifetime', after: 'mass' },
        { name: 'layout', before: 'infobox', after: 'table' },
      ],
    },
  ]);
});

test('identical blocks have no differences', () => {
  expect(diffCodexBlocks([p('a', 'Same'), p('b', 'Too')], [p('a', 'Same'), p('b', 'Too')])).toEqual([]);
});

test('ids the editor adds to nested paragraphs are not a change', () => {
  const list = (ids: boolean): CodexBlockNode =>
    ({
      type: 'bulletList',
      attrs: { id: 'steps' },
      content: ['Higgs anchor', 'Prop mod'].map((text, index) => ({
        type: 'listItem',
        attrs: {},
        content: [{ type: 'paragraph', attrs: ids ? { id: `n${index}` } : {}, content: [{ type: 'text', text, marks: [] }] }],
      })),
    }) as CodexBlockNode;
  expect(diffCodexBlocks([list(false)], [list(true)])).toEqual([]);
});

test('a whitespace-only edit shows the whitespace that changed', () => {
  expect(diffCodexBlocks([p('a', 'Warp in')], [p('a', 'Warp  in')])).toEqual([
    {
      kind: 'changed',
      id: 'a',
      words: [
        { op: 'same', text: 'Warp' },
        { op: 'removed', text: ' ' },
        { op: 'added', text: '  ' },
        { op: 'same', text: 'in' },
      ],
    },
  ]);
});

test('a 200-block page reports each edited block once', () => {
  const words = (seed: number) => Array.from({ length: 40 }, (_, index) => `word${(index * seed) % 97}`).join(' ');
  const before = Array.from({ length: 200 }, (_, index) => p(`b${index}`, words(index + 1)));
  const after = before.map((block, index) => (index % 3 === 0 ? p(`b${index}`, words(index + 7)) : block));
  const diff = diffCodexBlocks(before, after);
  expect(diff.map(({ id }) => id)).toEqual(Array.from({ length: 67 }, (_, index) => `b${index * 3}`));
  expect(diff.every((entry) => entry.kind === 'changed' && 'words' in entry)).toBe(true);
});
