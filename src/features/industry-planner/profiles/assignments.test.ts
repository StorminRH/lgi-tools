import { expect, test } from 'vitest';
import {
  addFacility,
  addMember,
  coveringParent,
  removeFacility,
  removeMember,
  setFacilityCategories,
  setMemberCategories,
  toggleCategory,
} from './assignments';
import { emptyProfileDocument, profileDocumentSchema, type ProfileFacility } from './profile-document';

const REACTOR = { characterId: 101, name: 'Reactor' };
const BUILDER = { characterId: 102, name: 'Builder' };
const SPARE = { characterId: 103, name: 'Spare' };

const facility = (kind: ProfileFacility['kind'], id: string, name: string): ProfileFacility => ({
  kind,
  id,
  name,
  systemId: 30000142,
  categories: [],
});
const TATARA = facility('structure', 'corp:1001', 'Tatara');
const SOTIYO = facility('structure', 'custom-sotiyo', 'Sotiyo');
const JITA = facility('station', '60003760', 'Jita IV - Moon 4 - Caldari Navy Assembly Plant');

test('ticking a parent covers its children, so they are not stored beside it', () => {
  let picked = toggleCategory([], 'capital-ships', true);
  picked = toggleCategory(picked, 'charges', true);
  expect(picked).toEqual(['capital-ships', 'charges']);

  picked = toggleCategory(picked, 'ships', true);
  expect(picked).toEqual(['charges', 'ships']);
  expect(coveringParent(picked, 'capital-ships')).toBe('ships');
  // A covered child cannot be ticked on its own.
  expect(toggleCategory(picked, 'small-t1-ships', true)).toEqual(picked);

  picked = toggleCategory(picked, 'manufacturing', true);
  expect(picked).toEqual(['manufacturing']);
  expect(coveringParent(picked, 'small-t1-ships')).toBe('manufacturing');
  // Reactions stand apart from manufacturing.
  expect(coveringParent(picked, 'composite-reactions')).toBeNull();

  picked = toggleCategory(picked, 'composite-reactions', true);
  picked = toggleCategory(picked, 'manufacturing', false);
  expect(picked).toEqual(['composite-reactions']);
});

test('members and facilities keep their own categories through edits', () => {
  let doc = emptyProfileDocument([REACTOR, BUILDER]);
  doc = addMember(doc, SPARE);
  doc = addMember(doc, SPARE);
  expect(doc.members.map((m) => m.characterId)).toEqual([101, 102, 103]);
  expect(doc.members[2]?.categories).toEqual([]);

  doc = setMemberCategories(doc, REACTOR.characterId, ['reactions']);
  doc = setMemberCategories(doc, BUILDER.characterId, ['components', 'capital-ships']);
  // Several members can cover the same category.
  doc = setMemberCategories(doc, SPARE.characterId, ['components']);

  doc = addFacility(doc, { ...TATARA, categories: ['reactions'] });
  doc = addFacility(doc, SOTIYO);
  doc = addFacility(doc, JITA);
  // Adding one already on the profile changes nothing.
  doc = addFacility(doc, { ...SOTIYO, categories: ['ships'] });
  doc = setFacilityCategories(doc, 'structure:custom-sotiyo', ['capital-ships', 'components']);
  doc = setFacilityCategories(doc, 'station:60003760', ['manufacturing']);
  expect(profileDocumentSchema.safeParse(doc).success).toBe(true);
  expect(doc.facilities.map((f) => [f.name, f.categories])).toEqual([
    ['Tatara', ['reactions']],
    ['Sotiyo', ['capital-ships', 'components']],
    ['Jita IV - Moon 4 - Caldari Navy Assembly Plant', ['manufacturing']],
  ]);

  doc = removeMember(doc, BUILDER.characterId);
  expect(doc.members.map((m) => [m.characterId, m.categories])).toEqual([
    [REACTOR.characterId, ['reactions']],
    [SPARE.characterId, ['components']],
  ]);
  doc = removeFacility(doc, 'structure:corp:1001');
  expect(doc.facilities.map((f) => f.name)).toEqual(['Sotiyo', 'Jita IV - Moon 4 - Caldari Navy Assembly Plant']);
});

test('the document contract rejects duplicate members and duplicate facilities', () => {
  const doc = addFacility(emptyProfileDocument([REACTOR]), SOTIYO);
  expect(profileDocumentSchema.safeParse({ ...doc, members: [...doc.members, ...doc.members] }).success).toBe(false);
  expect(profileDocumentSchema.safeParse({ ...doc, facilities: [SOTIYO, SOTIYO] }).success).toBe(false);
  // The same id as a structure and as a station are two facilities.
  expect(
    profileDocumentSchema.safeParse({ ...doc, facilities: [SOTIYO, { ...SOTIYO, kind: 'station' }] }).success,
  ).toBe(true);
});
