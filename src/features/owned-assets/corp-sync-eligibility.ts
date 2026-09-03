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

export const CORP_ASSETS_REQUIRED_ROLES = ['Director'] as const;

export function canSyncCorpAssets(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_ASSETS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
