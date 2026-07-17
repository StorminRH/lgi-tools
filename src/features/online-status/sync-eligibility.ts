// Whether a character can sync its online status (MIGRATE.A). Deliberately
// narrower than the sitewide deriveCharacterHealth (which flags any character
// missing any of the full EVE_SCOPES superset): the online sync needs exactly
// the read_online scope plus a live refresh token, and a character granted it
// under an older consent still syncs fine. Runtime-light — the Convex action
// imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request).
 */
export const ONLINE_SYNC_SCOPES = ['esi-location.read_online.v1'] as const;

/** Returns whether a linked character has token custody and the online-status scope. */
export function canSyncOnline(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !ONLINE_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
