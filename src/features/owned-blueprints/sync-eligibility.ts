export const BLUEPRINTS_SYNC_SCOPES = ['esi-characters.read_blueprints.v1'] as const;

export function canSyncBlueprints(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !BLUEPRINTS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
