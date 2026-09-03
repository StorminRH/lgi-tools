export const LOCATION_SYNC_SCOPES = [
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-location.read_online.v1',
] as const;

export function canSyncLocation(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !LOCATION_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
