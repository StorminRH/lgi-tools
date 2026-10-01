import type {
  FacilityRef,
  ProfileDocument,
  ProfileMember,
  Responsibility,
} from './profile-document';

/**
 * How responsibilities map onto production jobs: a reaction job belongs to
 * `reactions`; the manufacturing job for the product a plan is for belongs to
 * `final-assembly`; every other manufacturing job in the tree belongs to
 * `components`. The same item is final assembly in its own plan and a
 * component in a plan that consumes it. Science jobs belong to none yet.
 *
 */
export const RESPONSIBILITY_LABELS: Readonly<Record<Responsibility, string>> = {
  reactions: 'Reactions',
  components: 'Components',
  'final-assembly': 'Final assembly',
};

export function addMember(doc: ProfileDocument, member: ProfileMember): ProfileDocument {
  if (doc.members.some((m) => m.characterId === member.characterId)) return doc;
  return { ...doc, members: [...doc.members, member] };
}

/** Removing a member drops their responsibilities with them; nobody else's change. */
export function removeMember(doc: ProfileDocument, characterId: number): ProfileDocument {
  return {
    ...doc,
    members: doc.members.filter((m) => m.characterId !== characterId),
    rules: doc.rules.filter((rule) => rule.characterId !== characterId),
  };
}

export function setResponsibility(
  doc: ProfileDocument,
  characterId: number,
  responsibility: Responsibility,
  held: boolean,
): ProfileDocument {
  const others = doc.rules.filter(
    (rule) => !(rule.characterId === characterId && rule.responsibility === responsibility),
  );
  if (!held) return { ...doc, rules: others };
  if (others.length !== doc.rules.length) return doc;
  return { ...doc, rules: [...doc.rules, { characterId, responsibility, facility: null }] };
}

export function setDefaultFacility(
  doc: ProfileDocument,
  activity: 'manufacturing' | 'reactions',
  facility: FacilityRef | null,
): ProfileDocument {
  const key = activity === 'reactions' ? 'reactionFacility' : 'manufacturingFacility';
  return { ...doc, defaults: { ...doc.defaults, [key]: facility } };
}
