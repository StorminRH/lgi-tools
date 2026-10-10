import type { EveScope } from '@/config/eve-scopes';

/** The character asset read lives under `esi-assets`. */
export const ASSETS_SYNC_SCOPES = [
  'esi-assets.read_assets.v1',
] as const satisfies readonly EveScope[];

export function canSyncAssets(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !ASSETS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}
