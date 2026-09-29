import type {
  FacilityRef,
  ProfileDocument,
  ProfileMember,
  Responsibility,
  ResponsibilityRule,
} from './profile-document';

/**
 * How responsibilities map onto production jobs: a reaction job belongs to
 * `reactions`; the manufacturing job for the product a plan is for belongs to
 * `final-assembly`; every other manufacturing job in the tree belongs to
 * `components`. The same item is final assembly in its own plan and a
 * component in a plan that consumes it. Science jobs belong to none yet.
 *
 * Precedence when a job is resolved: an explicit job override, then the
 * matching profile rule, then a visible unassigned state. When several members
 * hold the same responsibility, the one earliest in the profile's member order
 * is primary and the rest are alternates.
 */
export const RESPONSIBILITY_LABELS: Readonly<Record<Responsibility, string>> = {
  reactions: 'Reactions',
  components: 'Components',
  'final-assembly': 'Final assembly',
};

export type FacilitySource = 'rule' | 'profile-default';

export type ResponsibilityResolution =
  | {
      status: 'assigned';
      characterId: number;
      facility: FacilityRef | null;
      facilitySource: FacilitySource | null;
      alternates: number[];
    }
  | { status: 'unassigned'; unavailable: number[] };

export function defaultFacilityFor(
  doc: Pick<ProfileDocument, 'defaults'>,
  responsibility: Responsibility,
): FacilityRef | null {
  return responsibility === 'reactions'
    ? doc.defaults.reactionFacility
    : doc.defaults.manufacturingFacility;
}

function holdersInMemberOrder(
  doc: Pick<ProfileDocument, 'members' | 'rules'>,
  responsibility: Responsibility,
): ResponsibilityRule[] {
  const order = new Map(doc.members.map((m, index) => [m.characterId, index]));
  return doc.rules
    .filter((rule) => rule.responsibility === responsibility && order.has(rule.characterId))
    .sort((a, b) => (order.get(a.characterId) ?? 0) - (order.get(b.characterId) ?? 0));
}

export function resolveResponsibility(
  doc: ProfileDocument,
  responsibility: Responsibility,
  isAvailable: (characterId: number) => boolean,
): ResponsibilityResolution {
  const holders = holdersInMemberOrder(doc, responsibility);
  const available = holders.filter((rule) => isAvailable(rule.characterId));
  const [primary, ...rest] = available;
  if (primary === undefined) {
    return { status: 'unassigned', unavailable: holders.map((rule) => rule.characterId) };
  }
  const fallback = defaultFacilityFor(doc, responsibility);
  const facility = primary.facility ?? fallback;
  return {
    status: 'assigned',
    characterId: primary.characterId,
    facility,
    facilitySource: primary.facility !== null ? 'rule' : fallback !== null ? 'profile-default' : null,
    alternates: rest.map((rule) => rule.characterId),
  };
}

export interface MissingFacility {
  facility: FacilityRef;
  characterId: number | null;
  responsibility: Responsibility | null;
}

/**
 * References a profile holds that no longer resolve: members this account no
 * longer links, and facilities that are no longer available (a deleted custom
 * structure, a corporation structure no longer shared). Facilities are only
 * checked once the list of available structures is known.
 */
export function profileReferenceIssues(
  doc: ProfileDocument,
  isLinked: (characterId: number) => boolean,
  availableFacilityIds: ReadonlySet<string> | null,
): { unlinkedMembers: ProfileMember[]; missingFacilities: MissingFacility[] } {
  const unlinkedMembers = doc.members.filter((m) => !isLinked(m.characterId));
  if (availableFacilityIds === null) return { unlinkedMembers, missingFacilities: [] };
  const missing = (ref: FacilityRef | null): ref is FacilityRef =>
    ref !== null && !availableFacilityIds.has(ref.id);
  const missingFacilities: MissingFacility[] = doc.rules
    .filter((rule) => missing(rule.facility))
    .map((rule) => ({
      facility: rule.facility as FacilityRef,
      characterId: rule.characterId,
      responsibility: rule.responsibility,
    }));
  for (const ref of [doc.defaults.manufacturingFacility, doc.defaults.reactionFacility]) {
    if (missing(ref)) missingFacilities.push({ facility: ref, characterId: null, responsibility: null });
  }
  return { unlinkedMembers, missingFacilities };
}

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

export function setRuleFacility(
  doc: ProfileDocument,
  characterId: number,
  responsibility: Responsibility,
  facility: FacilityRef | null,
): ProfileDocument {
  return {
    ...doc,
    rules: doc.rules.map((rule) =>
      rule.characterId === characterId && rule.responsibility === responsibility
        ? { ...rule, facility }
        : rule,
    ),
  };
}

export function setDefaultFacility(
  doc: ProfileDocument,
  activity: 'manufacturing' | 'reactions',
  facility: FacilityRef | null,
): ProfileDocument {
  const key = activity === 'reactions' ? 'reactionFacility' : 'manufacturingFacility';
  return { ...doc, defaults: { ...doc.defaults, [key]: facility } };
}
