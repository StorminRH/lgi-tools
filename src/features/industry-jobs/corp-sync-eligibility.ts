// Whether a character can sync CORP industry jobs (3.7.3.1) — the corp twin of
// sync-eligibility.ts. Two axes, deliberately separate:
//
//  - SCOPE (this file): the corp-jobs sync needs BOTH corp reads plus a live
//    refresh token — the roles read (to find which character may vend the corp
//    read) and the corp-jobs read itself. A character missing either is the
//    AccessGate / reconnect path, exactly like the character-jobs predicate.
//  - in-game ROLE (NOT this file): the corp-jobs endpoint also requires the
//    Factory_Manager role (a Director holds it implicitly). That is gated in the
//    Convex sync layer as a graceful 'needs_role' state — granting more scope
//    can't fix it, so it must never flow through the scope predicate here.
//
// Runtime-light — the Convex action imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request). A direct EVE_SCOPES import
 * here would be a feature → feature edge the boundary lint bans.
 */
export const CORP_INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
] as const;

/**
 * The in-game corp roles that admit a character to the corp industry-jobs
 * endpoint. Factory_Manager is the documented role; Director holds it
 * implicitly, but ESI lists roles explicitly, so we admit either. A 403 from
 * the actual read (role revoked mid-run) is the safety net.
 */
export const CORP_INDUSTRY_JOBS_REQUIRED_ROLES = ['Factory_Manager', 'Director'] as const;

export function canSyncCorpIndustryJobs(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_INDUSTRY_JOBS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
