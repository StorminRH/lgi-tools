import type { LinkedCharacter } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth, type GrantedScope, listGrantedScopes } from '@/platform/auth/scope-health';

export type CharacterRowView = {
  // Whether the character can't currently back its ESI calls (missing scopes or a

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

export function deriveAbsorbedCharacter(
  rawAbsorbed: string | string[] | undefined,
  characters: LinkedCharacter[],
): LinkedCharacter | undefined {
  const absorbedId = typeof rawAbsorbed === 'string' ? Number(rawAbsorbed) : null;
  return absorbedId !== null
    ? characters.find((c) => c.characterId === absorbedId)
    : undefined;
}
