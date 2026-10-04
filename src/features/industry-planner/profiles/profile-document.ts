import { z } from 'zod';
import { CATEGORY_KEYS } from './production-categories';

/**
 * A production profile: who is on the team, the facilities they build in, and
 * which production categories each member and each facility covers. These are
 * routing preferences, not proof a character can run a job; skills, structures
 * and slots stay with their authoritative owners and are resolved at read time.
 */

export const MAX_PROFILE_NAME_LEN = 60;
export const MAX_PROFILES_PER_USER = 20;
const MAX_PROFILE_MEMBERS = 60;
export const MAX_PROFILE_FACILITIES = 50;

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

/**
 * A stored document. Every write is validated, so one that no longer parses
 * reads as empty rather than failing the whole list.
 */
export function readStoredDocument(raw: unknown): ProfileDocument {
  const parsed = profileDocumentSchema.safeParse(raw);
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
