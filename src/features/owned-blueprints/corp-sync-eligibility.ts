// Whether a character can sync CORP owned blueprints (3.7.5.1) — the corp twin
// of sync-eligibility.ts. Two axes, deliberately separate:
//
//  - SCOPE (this file): the corp-blueprints sync needs BOTH corp reads plus a
//    live refresh token — the roles read (to find which character may vend the
//    corp read) and the corp-blueprints read itself. A character missing either
//    is the AccessGate / reconnect path, exactly like the corp-jobs predicate.
//  - in-game ROLE (NOT this file): the corp-blueprints endpoint also requires
//    the Director role. That is gated in the Convex sync layer as a graceful
//    'needs_role' state — granting more scope can't fix it, so it must never
//    flow through the scope predicate here.
//
// Runtime-light — the Convex action imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request). The roles read is shared with
 * corp industry jobs; the corp-blueprints read lives under `esi-corporations`
 * (NOT `esi-characters` — unlike the roles read). A direct EVE_SCOPES import
 * here would be a feature → feature edge the boundary lint bans.
 */
export const CORP_BLUEPRINTS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_blueprints.v1',
] as const;

/**
 * The in-game corp role that admits a character to the corp-blueprints
 * endpoint. Director only (unlike corp industry jobs, which Factory_Manager
 * also covers). A 403 from the actual read (role revoked mid-run) is the safety
 * net, mapped to the same 'needs_role' state.
 */
export const CORP_BLUEPRINTS_REQUIRED_ROLES = ['Director'] as const;

export function canSyncCorpBlueprints(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_BLUEPRINTS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
