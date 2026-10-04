import { expect, test } from 'vitest';
import { updateIndustryProfileRequestSchema } from './api-contract';
import {
  emptyProfileDocument,
  MAX_PROFILE_FACILITIES,
  profileDocumentSchema,
  readStoredDocument,
  unlinkedNewMembers,
} from './profile-document';

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


test('a profile holds up to fifty facilities', () => {
  const facility = (i: number) => ({ kind: 'station' as const, id: `${60000000 + i}`, name: `Station ${i}`, systemId: 30000142, categories: [] });
  const doc = (count: number) => ({ ...emptyProfileDocument(), facilities: Array.from({ length: count }, (_, i) => facility(i)) });
  expect(MAX_PROFILE_FACILITIES).toBe(50);
  expect(updateIndustryProfileRequestSchema.safeParse({ id: 'profile', expectedRevision: 1, name: 'Team', document: doc(50) }).success).toBe(true);
  expect(profileDocumentSchema.safeParse(doc(51)).success).toBe(false);
});

test('an earlier document shape is not read as a profile', () => {
  expect(readStoredDocument({ v: 1, members: [], rules: [], defaults: {} })).toEqual(emptyProfileDocument());
});
