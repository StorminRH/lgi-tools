import { expect, test } from 'vitest';
import { emptyProfileDocument, profileDocumentSchema } from './profile-document';
import {
  addMember,
  removeMember,
  setDefaultFacility,
  setResponsibility,
} from './responsibilities';

const REACTOR = { characterId: 101, name: 'Reactor' };
const BUILDER = { characterId: 102, name: 'Builder' };
const SPARE = { characterId: 103, name: 'Spare' };
const TATARA = { id: 'corp:1001', name: 'Tatara' };
const SOTIYO = { id: 'custom-sotiyo', name: 'Sotiyo' };
const AZBEL = { id: 'corp:1002', name: 'Azbel' };

test('a team retains distinct responsibilities, facilities and defaults through member edits', () => {
  let doc = emptyProfileDocument([REACTOR, BUILDER]);
  doc = addMember(doc, SPARE);
  doc = addMember(doc, SPARE);
  expect(doc.members.map((m) => m.characterId)).toEqual([101, 102, 103]);

  doc = setResponsibility(doc, REACTOR.characterId, 'reactions', true);
  doc = setResponsibility(doc, BUILDER.characterId, 'components', true);
  doc = setResponsibility(doc, BUILDER.characterId, 'final-assembly', true);
  // Saved facility preferences remain intact while responsibilities are edited.
  doc = {
    ...doc,
    rules: doc.rules.map((rule) => ({
      ...rule,
      facility: rule.responsibility === 'reactions'
        ? TATARA
        : rule.responsibility === 'final-assembly' ? SOTIYO : null,
    })),
  };
  doc = setDefaultFacility(doc, 'manufacturing', AZBEL);
  // Holding a responsibility twice is one rule, not two.
  doc = setResponsibility(doc, BUILDER.characterId, 'components', true);
  expect(profileDocumentSchema.safeParse(doc).success).toBe(true);

  expect(doc.rules).toEqual([
    { characterId: REACTOR.characterId, responsibility: 'reactions', facility: TATARA },
    { characterId: BUILDER.characterId, responsibility: 'components', facility: null },
    { characterId: BUILDER.characterId, responsibility: 'final-assembly', facility: SOTIYO },
  ]);
  expect(doc.defaults).toEqual({ manufacturingFacility: AZBEL, reactionFacility: null });
  doc = setDefaultFacility(doc, 'reactions', TATARA);
  expect(doc.defaults).toEqual({ manufacturingFacility: AZBEL, reactionFacility: TATARA });

  // Several members can hold the same responsibility.
  doc = setResponsibility(doc, SPARE.characterId, 'components', true);

  // Removing a member takes only their responsibilities with them.
  doc = removeMember(doc, BUILDER.characterId);
  expect(doc.rules.map((r) => [r.characterId, r.responsibility])).toEqual([
    [REACTOR.characterId, 'reactions'],
    [SPARE.characterId, 'components'],
  ]);
  doc = setResponsibility(doc, SPARE.characterId, 'components', false);
  expect(doc.rules).toEqual([
    { characterId: REACTOR.characterId, responsibility: 'reactions', facility: TATARA },
  ]);
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
