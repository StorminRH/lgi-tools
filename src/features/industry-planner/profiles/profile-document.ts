import { z } from 'zod';

/**
 * A production profile: who is on the team, which responsibilities each
 * member holds, and which facility they prefer for it. Rules are routing
 * preferences, not proof a character can run a job; skills, structures and
 * slots stay with their authoritative owners and are resolved at read time.
 */

export const RESPONSIBILITIES = ['reactions', 'components', 'final-assembly'] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

export const MAX_PROFILE_NAME_LEN = 60;
export const MAX_PROFILES_PER_USER = 20;
const MAX_PROFILE_MEMBERS = 60;

const facilityRefSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
});
export type FacilityRef = z.infer<typeof facilityRefSchema>;

const memberSchema = z.object({
  characterId: z.number().int().positive(),
  // The name when the member was added, so an unlinked member stays explainable.
  name: z.string().max(100),
});
export type ProfileMember = z.infer<typeof memberSchema>;

const ruleSchema = z.object({
  characterId: z.number().int().positive(),
  responsibility: z.enum(RESPONSIBILITIES),
  facility: facilityRefSchema.nullable(),
});
export type ResponsibilityRule = z.infer<typeof ruleSchema>;

const defaultsSchema = z.object({
  manufacturingFacility: facilityRefSchema.nullable(),
  reactionFacility: facilityRefSchema.nullable(),
});

export const profileDocumentSchema = z
  .object({
    v: z.literal(1),
    members: z.array(memberSchema).max(MAX_PROFILE_MEMBERS),
    rules: z.array(ruleSchema).max(MAX_PROFILE_MEMBERS * RESPONSIBILITIES.length),
    defaults: defaultsSchema,
  })
  .superRefine((doc, ctx) => {
    for (const issue of documentIssues(doc)) ctx.addIssue({ code: 'custom', message: issue });
  });
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;

function documentIssues(doc: Pick<ProfileDocument, 'members' | 'rules'>): string[] {
  const memberIds = new Set(doc.members.map((m) => m.characterId));
  const issues: string[] = [];
  if (memberIds.size !== doc.members.length) issues.push('duplicate member');
  const ruleKeys = new Set(doc.rules.map((r) => `${r.characterId}:${r.responsibility}`));
  if (ruleKeys.size !== doc.rules.length) issues.push('duplicate responsibility');
  if (doc.rules.some((r) => !memberIds.has(r.characterId))) issues.push('rule for a non-member');
  return issues;
}

export function emptyProfileDocument(members: readonly ProfileMember[] = []): ProfileDocument {
  return {
    v: 1,
    members: [...members],
    rules: [],
    defaults: { manufacturingFacility: null, reactionFacility: null },
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
