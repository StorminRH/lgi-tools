/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must never
 * demand a scope sign-in doesn't request). The roles read is shared with corp jobs /
 * blueprints / assets; the corp-structures read lives under `esi-corporations`. A
 * direct EVE_SCOPES import here would be a feature → feature edge the boundary lint
 * bans.
 */
export const CORP_STRUCTURES_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
] as const;

export const CORP_STRUCTURES_REQUIRED_ROLES = ['Station_Manager'] as const;

export function canSyncCorpStructures(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_STRUCTURES_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
