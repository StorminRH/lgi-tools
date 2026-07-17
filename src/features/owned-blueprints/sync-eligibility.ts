// Whether a character can sync THIS tracker's data — its OWN blueprints
// (3.7.5.1). Deliberately narrower than the sitewide deriveCharacterHealth
// (which flags any character missing any of the full EVE_SCOPES superset): the
// character blueprints sync needs exactly this one scope plus a live refresh
// token, and a character granted it under an older, smaller consent still syncs
// fine. The character read needs no in-game role. Runtime-light — the Convex
// action imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request).
 */
export const BLUEPRINTS_SYNC_SCOPES = ['esi-characters.read_blueprints.v1'] as const;

/** Returns whether a linked character has token custody and the personal-blueprints scope. */
export function canSyncBlueprints(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !BLUEPRINTS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
