import { expect, test } from 'vitest';
import { emptyProfileDocument, readStoredDocument, unlinkedNewMembers } from './profile-document';

test('a first-version profile reads with its responsibilities and defaults as categories', () => {
  const stored = {
    v: 1,
    members: [
      { characterId: 101, name: 'Reactor' },
      { characterId: 102, name: 'Builder' },
    ],
    rules: [
      { characterId: 101, responsibility: 'reactions', facility: null },
      { characterId: 102, responsibility: 'components', facility: null },
      { characterId: 102, responsibility: 'final-assembly', facility: null },
    ],
    defaults: {
      manufacturingFacility: { id: 'corp:5', name: 'Azbel' },
      reactionFacility: { id: 'corp:5', name: 'Azbel' },
    },
  };
  expect(readStoredDocument(stored)).toEqual({
    v: 2,
    members: [
      { characterId: 101, name: 'Reactor', categories: ['reactions'] },
      { characterId: 102, name: 'Builder', categories: ['components', 'manufacturing'] },
    ],
    facilities: [
      { kind: 'structure', id: 'corp:5', name: 'Azbel', systemId: null, categories: ['manufacturing', 'reactions'] },
    ],
  });
});

test('a current profile reads as stored, and one that no longer parses reads as empty', () => {
  const doc = emptyProfileDocument([{ characterId: 101, name: 'Reactor' }]);
  expect(readStoredDocument(doc)).toEqual(doc);
  expect(readStoredDocument({ v: 2, members: 'nope' })).toEqual(emptyProfileDocument());
  expect(readStoredDocument(null)).toEqual(emptyProfileDocument());
});

test('only members a write adds must be linked; kept members may have been unlinked since', () => {
  const previous = emptyProfileDocument([{ characterId: 9, name: 'Old Alt' }]);
  const next = emptyProfileDocument([
    { characterId: 9, name: 'Old Alt' },
    { characterId: 101, name: 'Reactor' },
    { characterId: 555, name: 'Stranger' },
  ]);
  expect(unlinkedNewMembers(next, previous, new Set([101]))).toEqual([555]);
  expect(unlinkedNewMembers(next, null, new Set([101]))).toEqual([9, 555]);
});
