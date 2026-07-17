// Whether a character can sync CORP owned assets (3.7.7.1) — the corp twin of
// sync-eligibility.ts. Two axes, deliberately separate:
//
//  - SCOPE (this file): the corp-assets sync needs BOTH corp reads plus a live
//    refresh token — the roles read (to find which character may vend the corp
//    read) and the corp-assets read itself. A character missing either is the
//    AccessGate / reconnect path, exactly like the corp-blueprints predicate.
//  - in-game ROLE (NOT this file): the corp-assets endpoint also requires the
//    Director role. That is gated in the refresh layer as a graceful skip —
//    granting more scope can't fix it, so it must never flow through the scope
//    predicate here.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request). The roles read is shared with
 * corp industry jobs + corp blueprints; the corp-assets read lives under
 * `esi-assets` (NOT `esi-corporations` — unlike the corp BLUEPRINTS read). A
 * direct EVE_SCOPES import here would be a feature → feature edge the boundary
 * lint bans.
 */
export const CORP_ASSETS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-assets.read_corporation_assets.v1',
] as const;

/**
 * The in-game corp role that admits a character to the corp-assets endpoint.
 * Director only. A 403 from the actual read (role revoked mid-run) is the safety
 * net, mapped to the same graceful skip.
 */
export const CORP_ASSETS_REQUIRED_ROLES = ['Director'] as const;

export function canSyncCorpAssets(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_ASSETS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
