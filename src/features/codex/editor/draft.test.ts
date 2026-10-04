import { expect, test } from 'vitest';
import { codexDraftKey, initialEditorBlocks, keepCodexDraft, takeCodexDraft, takeConflictDraft } from './draft';

function memoryStore() {
  const items = new Map<string, string>();
  return {
    items,
    store: () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    }),
  };
}

const subject = { kind: 'guides', key: 'rolling-a-c3' } as const;
const typed = {
  blocks: [{ type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Typed in tab two.' }] }],
  summary: 'Tab two',
};

test('names one draft slot per section and one for the whole page', () => {
  expect(codexDraftKey(subject, 'ships')).toBe('codex-draft:guides/rolling-a-c3:ships');
  expect(codexDraftKey(subject, null)).toBe('codex-draft:guides/rolling-a-c3:page');
});

test('restores the kept draft after a conflict and clears the slot', () => {
  const { items, store } = memoryStore();
  const key = codexDraftKey(subject, 'lead');

  expect(keepCodexDraft(key, typed, store)).toBe(true);
  expect(takeCodexDraft(key, true, store)).toEqual({
    blocks: [{ type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Typed in tab two.' }] }],
    summary: 'Tab two',
  });
  expect(items.size).toBe(0);
  expect(takeCodexDraft(key, true, store)).toBeNull();
});

test('drops a leftover draft when the editor opens without a notice', () => {
  const { items, store } = memoryStore();
  const key = codexDraftKey(subject, 'lead');
  keepCodexDraft(key, typed, store);

  expect(takeCodexDraft(key, false, store)).toBeNull();
  expect(items.size).toBe(0);
});

test('ignores a draft it cannot read', () => {
  const { items, store } = memoryStore();
  items.set('broken', '{not json');
  items.set('wrong-shape', JSON.stringify({ blocks: 'nope' }));

  expect(takeCodexDraft('broken', true, store)).toBeNull();
  expect(takeCodexDraft('wrong-shape', true, store)).toBeNull();
  const blocked = () => {
    throw new Error('storage disabled');
  };
  expect(takeCodexDraft('any', true, blocked)).toBeNull();
  expect(keepCodexDraft('any', typed, blocked)).toBe(false);
});

test('starts from the draft, then the section, then one empty paragraph', () => {
  const section = [{ type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Start here.' }] }];

  expect(initialEditorBlocks(typed, section)).toEqual(typed.blocks);
  expect(initialEditorBlocks(null, section)).toEqual([
    { type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Start here.' }] },
  ]);
  expect(initialEditorBlocks(null, [])).toEqual([{ type: 'paragraph' }]);
});

test('appends a draft from a section the newer page dropped after the page blocks', () => {
  const page = [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Newer text.' }] }];

  expect(initialEditorBlocks(typed, page, true)).toEqual([
    { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Newer text.' }] },
    { type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Typed in tab two.' }] },
  ]);
  expect(initialEditorBlocks(null, page, true)).toEqual([
    { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Newer text.' }] },
  ]);
});

test('a conflict on a removed section restores the draft kept under that section', () => {
  const { items, store } = memoryStore();
  keepCodexDraft(codexDraftKey(subject, 'ships'), typed, store);
  keepCodexDraft(codexDraftKey(subject, null), { blocks: [], summary: 'Stale page draft' }, store);

  expect(takeConflictDraft(subject, null, 'ships', true, store)).toEqual({
    blocks: [{ type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Typed in tab two.' }] }],
    summary: 'Tab two',
  });
  expect([...items.keys()]).toEqual(['codex-draft:guides/rolling-a-c3:page']);
});

test('a conflict on a live section restores the draft kept under its own key', () => {
  const { items, store } = memoryStore();
  keepCodexDraft(codexDraftKey(subject, 'ships'), typed, store);

  expect(takeConflictDraft(subject, 'ships', null, true, store)).toEqual(typed);
  expect(items.size).toBe(0);
});
