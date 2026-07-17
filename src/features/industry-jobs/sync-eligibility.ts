// Whether a character can sync THIS tracker's data. Deliberately narrower
// than the sitewide deriveCharacterHealth (which flags any character missing
// any of the full EVE_SCOPES superset): the industry-jobs sync needs exactly
// this one scope plus a live refresh token, and a character granted it under
// an older, smaller consent still syncs fine. Runtime-light — the Convex
// action imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request).
 */
export const INDUSTRY_JOBS_SYNC_SCOPES = ['esi-industry.read_character_jobs.v1'] as const;

export function canSyncIndustryJobs(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !INDUSTRY_JOBS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
