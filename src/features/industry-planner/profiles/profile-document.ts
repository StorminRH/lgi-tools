import { z } from 'zod';
import { ALL_MANUFACTURING, CATEGORY_KEYS, type CategoryKey } from './production-categories';

/**
 * A production profile: who is on the team, the facilities they build in, and
 * which production categories each member and each facility covers. These are
 * routing preferences, not proof a character can run a job; skills, structures
 * and slots stay with their authoritative owners and are resolved at read time.
 */

export const MAX_PROFILE_NAME_LEN = 60;
export const MAX_PROFILES_PER_USER = 20;
const MAX_PROFILE_MEMBERS = 60;
// A valid v1 profile can hold three facility overrides per member and two defaults.
const MAX_PROFILE_FACILITIES = MAX_PROFILE_MEMBERS * 3 + 2;

const categoriesSchema = z.array(z.enum(CATEGORY_KEYS)).max(CATEGORY_KEYS.length);

const memberSchema = z.object({
  characterId: z.number().int().positive(),
  // The name when the member was added, so an unlinked member stays explainable.
  name: z.string().max(100),
  categories: categoriesSchema,
});
export type ProfileMember = z.infer<typeof memberSchema>;

/** A saved or shared structure (by its available-structure id) or an NPC station (by station id). */
const facilitySchema = z.object({
  kind: z.enum(['structure', 'station']),
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  systemId: z.number().int().positive().nullable(),
  categories: categoriesSchema,
});
export type ProfileFacility = z.infer<typeof facilitySchema>;

export const profileDocumentSchema = z
  .object({
    v: z.literal(2),
    members: z.array(memberSchema).max(MAX_PROFILE_MEMBERS),
    facilities: z.array(facilitySchema).max(MAX_PROFILE_FACILITIES),
  })
  .superRefine((doc, ctx) => {
    for (const issue of documentIssues(doc)) ctx.addIssue({ code: 'custom', message: issue });
  });
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;

export function facilityKey(facility: Pick<ProfileFacility, 'kind' | 'id'>): string {
  return `${facility.kind}:${facility.id}`;
}

function documentIssues(doc: Pick<ProfileDocument, 'members' | 'facilities'>): string[] {
  const issues: string[] = [];
  if (new Set(doc.members.map((m) => m.characterId)).size !== doc.members.length) issues.push('duplicate member');
  if (new Set(doc.facilities.map(facilityKey)).size !== doc.facilities.length) issues.push('duplicate facility');
  return issues;
}

type V1Document = {
  v: 1;
  members?: { characterId: number; name: string }[];
  rules?: { characterId: number; responsibility: string; facility?: { id: string; name: string } | null }[];
  defaults?: Record<string, { id: string; name: string } | null>;
};

const V1_CATEGORY: Record<string, CategoryKey> = {
  reactions: 'reactions',
  components: 'components',
  'final-assembly': ALL_MANUFACTURING,
};

/**
 * The first document shape held per-member responsibilities and two default
 * facilities. They become categories: reactions and components keep their
 * names, final assembly and the manufacturing default become all manufacturing.
 */
function upgradeV1(doc: V1Document): z.input<typeof profileDocumentSchema> {
  const categoriesOf = (characterId: number) => [
    ...new Set(
      (doc.rules ?? []).flatMap((r) => (r.characterId === characterId && V1_CATEGORY[r.responsibility]) || []),
    ),
  ];
  const defaults: [string, CategoryKey][] = [
    ['manufacturingFacility', ALL_MANUFACTURING],
    ['reactionFacility', 'reactions'],
  ];
  const facilities = new Map<string, ProfileFacility>();
  const addFacility = (ref: { id: string; name: string }, category: CategoryKey) => {
    const held = facilities.get(ref.id);
    facilities.set(ref.id, {
      kind: 'structure',
      id: ref.id,
      name: ref.name,
      systemId: null,
      categories: [...new Set([...(held?.categories ?? []), category])],
    });
  };
  for (const [slot, category] of defaults) {
    const ref = doc.defaults?.[slot];
    if (ref) addFacility(ref, category);
  }
  for (const rule of doc.rules ?? []) {
    const category = V1_CATEGORY[rule.responsibility];
    if (rule.facility && category) addFacility(rule.facility, category);
  }
  return {
    v: 2,
    members: (doc.members ?? []).map((m) => ({ ...m, categories: categoriesOf(m.characterId) })),
    facilities: [...facilities.values()],
  };
}

const storedProfileDocumentSchema = z.preprocess(
  (raw) => (typeof raw === 'object' && raw !== null && (raw as { v?: unknown }).v === 1 ? upgradeV1(raw as V1Document) : raw),
  profileDocumentSchema,
);

/**
 * A stored document of any shape this app has written, read as the current
 * one. Every write is validated, so one that no longer parses reads as empty
 * rather than failing the whole list.
 */
export function readStoredDocument(raw: unknown): ProfileDocument {
  const parsed = storedProfileDocumentSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyProfileDocument();
}

export function emptyProfileDocument(members: readonly Omit<ProfileMember, 'categories'>[] = []): ProfileDocument {
  return {
    v: 2,
    members: members.map((m) => ({ ...m, categories: [] })),
    facilities: [],
  };
}

/**
 * Members a write adds that the account does not hold. Members already on the
 * stored profile may stay after they are unlinked, so they remain visible as
 * unresolved instead of silently disappearing from the team.
 */
export function unlinkedNewMembers(
  next: Pick<ProfileDocument, 'members'>,
  previous: Pick<ProfileDocument, 'members'> | null,
  linkedCharacterIds: ReadonlySet<number>,
): number[] {
  const kept = new Set(previous?.members.map((m) => m.characterId) ?? []);
  return next.members
    .map((m) => m.characterId)
    .filter((id) => !kept.has(id) && !linkedCharacterIds.has(id));
}
