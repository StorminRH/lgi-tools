import { deriveCharacterHealth } from './scope-health';

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
