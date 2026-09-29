import { expect, test } from 'vitest';
import { emptyProfileDocument, profileDocumentSchema } from './profile-document';
import {
  addMember,
  profileReferenceIssues,
  removeMember,
  resolveResponsibility,
  setDefaultFacility,
  setResponsibility,
  setRuleFacility,
} from './responsibilities';

const REACTOR = { characterId: 101, name: 'Reactor' };
const BUILDER = { characterId: 102, name: 'Builder' };
const SPARE = { characterId: 103, name: 'Spare' };
const TATARA = { id: 'corp:1001', name: 'Tatara' };
const SOTIYO = { id: 'custom-sotiyo', name: 'Sotiyo' };
const AZBEL = { id: 'corp:1002', name: 'Azbel' };

test('a team routes reactions, components and final assembly to distinct members and facilities', () => {
  let doc = emptyProfileDocument([REACTOR, BUILDER]);
  doc = addMember(doc, SPARE);
  doc = addMember(doc, SPARE);
  expect(doc.members.map((m) => m.characterId)).toEqual([101, 102, 103]);

  doc = setResponsibility(doc, REACTOR.characterId, 'reactions', true);
  doc = setRuleFacility(doc, REACTOR.characterId, 'reactions', TATARA);
  doc = setResponsibility(doc, BUILDER.characterId, 'components', true);
  doc = setResponsibility(doc, BUILDER.characterId, 'final-assembly', true);
  doc = setRuleFacility(doc, BUILDER.characterId, 'final-assembly', SOTIYO);
  doc = setDefaultFacility(doc, 'manufacturing', AZBEL);
  // Holding a responsibility twice is one rule, not two.
  doc = setResponsibility(doc, BUILDER.characterId, 'components', true);
  expect(profileDocumentSchema.safeParse(doc).success).toBe(true);

  const linked = () => true;
  expect(resolveResponsibility(doc, 'reactions', linked)).toEqual({
    status: 'assigned',
    characterId: REACTOR.characterId,
    facility: TATARA,
    facilitySource: 'rule',
    alternates: [],
  });
  // No facility on the rule: the profile's manufacturing default applies and says so.
  expect(resolveResponsibility(doc, 'components', linked)).toMatchObject({
    characterId: BUILDER.characterId,
    facility: AZBEL,
    facilitySource: 'profile-default',
  });
  expect(resolveResponsibility(doc, 'final-assembly', linked)).toMatchObject({
    facility: SOTIYO,
    facilitySource: 'rule',
  });

  // Two members on components: the earlier member is primary, the other an alternate.
  doc = setResponsibility(doc, SPARE.characterId, 'components', true);
  expect(resolveResponsibility(doc, 'components', linked)).toMatchObject({
    characterId: BUILDER.characterId,
    alternates: [SPARE.characterId],
  });
  // An unlinked primary is skipped rather than silently used.
  const builderGone = (id: number) => id !== BUILDER.characterId;
  expect(resolveResponsibility(doc, 'components', builderGone)).toMatchObject({
    characterId: SPARE.characterId,
    alternates: [],
  });
  expect(resolveResponsibility(doc, 'final-assembly', builderGone)).toEqual({
    status: 'unassigned',
    unavailable: [BUILDER.characterId],
  });

  // Removing a member takes only their responsibilities with them.
  doc = removeMember(doc, BUILDER.characterId);
  expect(doc.rules.map((r) => [r.characterId, r.responsibility])).toEqual([
    [REACTOR.characterId, 'reactions'],
    [SPARE.characterId, 'components'],
  ]);
  doc = setResponsibility(doc, SPARE.characterId, 'components', false);
  expect(resolveResponsibility(doc, 'components', linked)).toEqual({
    status: 'unassigned',
    unavailable: [],
  });
});

test('the document contract rejects duplicate members, duplicate rules and rules for non-members', () => {
  const doc = setResponsibility(emptyProfileDocument([REACTOR]), REACTOR.characterId, 'reactions', true);
  expect(profileDocumentSchema.safeParse({ ...doc, members: [REACTOR, REACTOR] }).success).toBe(false);
  expect(profileDocumentSchema.safeParse({ ...doc, rules: [...doc.rules, ...doc.rules] }).success).toBe(
    false,
  );
  expect(
    profileDocumentSchema.safeParse({
      ...doc,
      rules: [{ characterId: BUILDER.characterId, responsibility: 'components', facility: null }],
    }).success,
  ).toBe(false);
});

test('unlinked members and unavailable facilities surface as unresolved references', () => {
  let doc = emptyProfileDocument([REACTOR, BUILDER]);
  doc = setResponsibility(doc, REACTOR.characterId, 'reactions', true);
  doc = setRuleFacility(doc, REACTOR.characterId, 'reactions', TATARA);
  doc = setDefaultFacility(doc, 'manufacturing', AZBEL);
  const isLinked = (id: number) => id !== BUILDER.characterId;

  // While structures are still loading nothing is reported missing.
  expect(profileReferenceIssues(doc, isLinked, null)).toEqual({
    unlinkedMembers: [BUILDER],
    missingFacilities: [],
  });
  expect(profileReferenceIssues(doc, isLinked, new Set([AZBEL.id]))).toEqual({
    unlinkedMembers: [BUILDER],
    missingFacilities: [
      { facility: TATARA, characterId: REACTOR.characterId, responsibility: 'reactions' },
    ],
  });
  expect(profileReferenceIssues(doc, isLinked, new Set([TATARA.id])).missingFacilities).toEqual([
    { facility: AZBEL, characterId: null, responsibility: null },
  ]);
});
