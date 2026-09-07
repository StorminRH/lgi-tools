import type { AccountCharactersResponse } from './api-contract';
import { deriveCharacterHealth, deriveScopeHealth } from './scope-health';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

export function toPanelCharacter(
  character: {
    characterId: number;
    name: string;
    portraitUrl: string;
    scope: string | null | undefined;
    hasRefreshToken: boolean;
  },
  canSync: (eligibility: { hasRefreshToken: boolean; missingScopes: string[] }) => boolean,
): PanelCharacter {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    needsReconnect: !canSync({
      hasRefreshToken: character.hasRefreshToken,
      missingScopes: health.missingScopes,
    }),
  };
}

export function toAccountCharacter(
  character: {
    characterId: number;
    name: string;
    portraitUrl: string;
    scope: string | null | undefined;
    hasRefreshToken: boolean;
  },
  scopes: {
    skillQueue: readonly string[];
    location: readonly string[];
  },
): AccountCharactersResponse['characters'][number] {
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    needsReconnect: deriveScopeHealth(character, scopes.skillQueue).needsReconnect,
    needsLocationReconnect: deriveScopeHealth(character, scopes.location).needsReconnect,
  };
}
