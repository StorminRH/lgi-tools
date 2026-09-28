import { deriveCharacterHealth, type GrantedScope, listGrantedScopes } from '@/platform/auth/scope-health';

export type CharacterRowView = {
  needsReconnect: boolean;
  healthLabel: string | null;
  authorizationDelayed: boolean;
  scopes: GrantedScope[];
};

export function deriveCharacterRowView(character: {
  scope: string | null;
  hasRefreshToken: boolean;
  authorizationDelayed?: boolean;
}): CharacterRowView {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const authorizationDelayed = character.hasRefreshToken && character.authorizationDelayed === true;
  const healthLabel = !health.needsReconnect
    ? authorizationDelayed ? 'Verification delayed' : null
    : character.hasRefreshToken
      ? 'Missing scopes'
      : 'Disconnected';
  return {
    needsReconnect: health.needsReconnect,
    healthLabel,
    authorizationDelayed,
    scopes: listGrantedScopes(character.scope),
  };
}
