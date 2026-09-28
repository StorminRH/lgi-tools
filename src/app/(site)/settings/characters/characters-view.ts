import { deriveCharacterHealth, type GrantedScope, listGrantedScopes } from '@/platform/auth/scope-health';

export type CharacterRowView = {
  needsReconnect: boolean;
  healthLabel: string | null;
  scopes: GrantedScope[];
};

export function deriveCharacterRowView(character: {
  scope: string | null;
  hasRefreshToken: boolean;
}): CharacterRowView {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const healthLabel = !health.needsReconnect
    ? null
    : character.hasRefreshToken
      ? 'Missing scopes'
      : 'Disconnected';
  return {
    needsReconnect: health.needsReconnect,
    healthLabel,
    scopes: listGrantedScopes(character.scope),
  };
}
