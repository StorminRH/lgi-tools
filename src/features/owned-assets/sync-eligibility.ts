/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request). The asset reads live under
 * `esi-assets`. A direct EVE_SCOPES import here would be a feature → feature edge
 * the boundary lint bans.
 */
export const ASSETS_SYNC_SCOPES = ['esi-assets.read_assets.v1'] as const;

export function canSyncAssets(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !ASSETS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
