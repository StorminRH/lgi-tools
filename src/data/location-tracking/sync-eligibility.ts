// Whether a character can sync its tracked location (4.0.4.2.1). Deliberately
// narrower than the sitewide deriveCharacterHealth (which flags any character
// missing any of the full EVE_SCOPES superset): location sync needs the
// location, ship-type, and online scopes plus a live refresh token — the
// online read joined this gate when the location sync absorbed the in-game
// online probe as its pause/resume signal. A tracked character under an old
// consent missing read_online records reauth_required rather than silently
// tracking without a stop condition. Runtime-light — the Convex action
// imports this too.

/**
 * Pinned ∈ EVE_SCOPES by the co-located test (the PR #83 lesson: a sync must
 * never demand a scope sign-in doesn't request).
 */
export const LOCATION_SYNC_SCOPES = [
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-location.read_online.v1',
] as const;

/** Returns whether a linked character has token custody and all three location-sync scopes. */
export function canSyncLocation(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !LOCATION_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
