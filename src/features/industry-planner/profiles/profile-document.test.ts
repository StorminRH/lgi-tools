import { expect, test } from 'vitest';
import { updateIndustryProfileRequestSchema } from './api-contract';
import { emptyProfileDocument, profileDocumentSchema, readStoredDocument, unlinkedNewMembers } from './profile-document';

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


test('legacy facility overrides survive alongside defaults and shared categories dedupe', () => {
  const doc = readStoredDocument({
    v: 1,
    members: [{ characterId: 101, name: 'Builder' }, { characterId: 102, name: 'Alt' }],
    rules: [
      { characterId: 101, responsibility: 'components', facility: { id: 'corp:7', name: 'Components' } },
      { characterId: 102, responsibility: 'components', facility: { id: 'corp:7', name: 'Components' } },
      { characterId: 101, responsibility: 'reactions', facility: { id: 'corp:7', name: 'Components' } },
      { characterId: 101, responsibility: 'final-assembly', facility: { id: 'corp:8', name: 'Assembly' } },
    ],
    defaults: { manufacturingFacility: { id: 'corp:6', name: 'Default' }, reactionFacility: null },
  });
  expect(doc.facilities).toEqual([
    { kind: 'structure', id: 'corp:6', name: 'Default', systemId: null, categories: ['manufacturing'] },
    { kind: 'structure', id: 'corp:7', name: 'Components', systemId: null, categories: ['components', 'reactions'] },
    { kind: 'structure', id: 'corp:8', name: 'Assembly', systemId: null, categories: ['manufacturing'] },
  ]);
  expect(profileDocumentSchema.safeParse(doc).success).toBe(true);
});

test('the largest valid legacy profile keeps all facilities and remains editable', () => {
  const responsibilities = ['reactions', 'components', 'final-assembly'];
  const members = Array.from({ length: 60 }, (_, i) => ({ characterId: i + 1, name: `Builder ${i}` }));
  const doc = readStoredDocument({
    v: 1,
    members,
    rules: members.flatMap((member) => responsibilities.map((responsibility) => ({
      characterId: member.characterId,
      responsibility,
      facility: { id: `${member.characterId}-${responsibility}`, name: responsibility },
    }))),
    defaults: {
      manufacturingFacility: { id: 'mfg', name: 'Default manufacturing' },
      reactionFacility: { id: 'rxn', name: 'Default reactions' },
    },
  });
  expect(doc.members).toHaveLength(60);
  expect(doc.facilities).toHaveLength(182);
  expect(updateIndustryProfileRequestSchema.safeParse({
    id: 'profile', expectedRevision: 1, name: 'Legacy team', document: doc,
  }).success).toBe(true);
  expect(doc.facilities.at(-1)).toEqual({
    kind: 'structure', id: '60-final-assembly', name: 'final-assembly', systemId: null, categories: ['manufacturing'],
  });
  expect(profileDocumentSchema.safeParse(doc).success).toBe(true);
  expect(profileDocumentSchema.safeParse({
    ...doc,
    facilities: [...doc.facilities, { ...doc.facilities[0], id: 'too-many' }],
  }).success).toBe(false);
});
