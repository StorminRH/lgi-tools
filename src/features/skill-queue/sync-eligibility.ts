// Whether a character can sync THIS tracker's data. Deliberately narrower
// than the sitewide deriveCharacterHealth (which flags any character missing
// any of the full EVE_SCOPES superset): the skill-queue sync needs exactly
// these two scopes plus a live refresh token, and a character granted them
// under an older, smaller consent still syncs fine. Runtime-light — the
// Convex action imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request).
 */
export const SKILL_SYNC_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
] as const;

/** Returns whether a linked character has token custody and the skills scope required for queue sync. */
export function canSyncSkillQueue(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !SKILL_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
