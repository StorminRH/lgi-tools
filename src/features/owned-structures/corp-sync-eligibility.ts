import type { EveScope } from '@/config/eve-scopes';

/**
 * The roles read is shared with corp jobs / blueprints / assets; the
 * corp-structures read lives under `esi-corporations`.
 */
export const CORP_STRUCTURES_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
] as const satisfies readonly EveScope[];

export const CORP_STRUCTURES_REQUIRED_ROLES = ['Station_Manager', 'Director'] as const;

export function canSyncCorpStructures(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_STRUCTURES_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
