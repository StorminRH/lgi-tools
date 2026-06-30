// Whether a character can sync CORP owned structures (3.7.9) — the corp-only twin
// of the owned-assets corp eligibility. Two axes, deliberately separate:
//
//  - SCOPE (this file): the corp-structures sync needs BOTH corp reads plus a live
//    refresh token — the roles read (to find which character may vend the corp read)
//    and the corp-structures read itself. A character missing either is the
//    AccessGate / reconnect path, exactly like the corp-assets predicate.
//  - in-game ROLE (NOT this file): the corp-structures endpoint also requires the
//    Station_Manager role. That is gated in the refresh layer as a graceful skip —
//    granting more scope can't fix it, so it must never flow through the scope
//    predicate here.

// Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must never
// demand a scope sign-in doesn't request). The roles read is shared with corp jobs /
// blueprints / assets; the corp-structures read lives under `esi-corporations`. A
// direct EVE_SCOPES import here would be a feature → feature edge the boundary lint
// bans.
export const CORP_STRUCTURES_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
] as const;

// The in-game corp role that admits a character to the corp-structures endpoint.
// Station_Manager only (NOT Director — distinct from corp jobs/assets). A 403 from
// the actual read (role revoked mid-run) is the safety net, mapped to the same
// graceful skip.
export const CORP_STRUCTURES_REQUIRED_ROLES = ['Station_Manager'] as const;

export function canSyncCorpStructures(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_STRUCTURES_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
