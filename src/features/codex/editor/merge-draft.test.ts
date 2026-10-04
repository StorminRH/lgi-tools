import { expect, test } from 'vitest';
import { codexMergeDraftKey, isMergeDraft, restoreMergeDraft } from './merge-draft';

const edited = { blocks: [{ type: 'paragraph', attrs: { id: 's2' }, content: [{ type: 'text', text: 'By hand.' }] }] };

test('hand edits survive a moved page, picks only while the head is the same', () => {
  const draft = { headRevisionId: 'r2', choices: { s1: 'head' as const, s2: edited } };

  expect(restoreMergeDraft(draft, 'r3')).toEqual({ s2: edited });
  expect(restoreMergeDraft(draft, 'r2')).toEqual({ s1: 'head', s2: edited });
  expect(restoreMergeDraft(null, 'r2')).toEqual({});
  expect(codexMergeDraftKey('33333333-3333-4333-8333-333333333333')).toBe(
    'codex-merge:33333333-3333-4333-8333-333333333333',
  );
});

test('only a draft with known choices is restored', () => {
  expect(isMergeDraft({ headRevisionId: null, choices: { s1: 'proposal', s2: edited } })).toBe(true);
  expect(isMergeDraft({ headRevisionId: 'r2', choices: { s1: 'edit' } })).toBe(false);
  expect(isMergeDraft({ headRevisionId: 7, choices: {} })).toBe(false);
  expect(isMergeDraft({ choices: {} })).toBe(false);
  expect(isMergeDraft('nope')).toBe(false);
});
