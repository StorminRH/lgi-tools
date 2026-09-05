import { deriveCharacterHealth } from './scope-health';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

function eligibilityOf(character: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): {
  hasRefreshToken: boolean;
  missingScopes: string[];
} {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  return {
    hasRefreshToken: character.hasRefreshToken,
    missingScopes: health.missingScopes,
  };
}

function panelFields(
  character: {
    characterId: number;
    name: string;
    portraitUrl: string;
  },
  needsReconnect: boolean,
): PanelCharacter {
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    needsReconnect,
  };
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
  return panelFields(character, !canSync(eligibilityOf(character)));
}

export function toAccountCharacter(
  character: {
    characterId: number;
    name: string;
    portraitUrl: string;
    scope: string | null | undefined;
    hasRefreshToken: boolean;
  },
  canSync: {
    skillQueue: (eligibility: {
      hasRefreshToken: boolean;
      missingScopes: string[];
    }) => boolean;
    location: (eligibility: {
      hasRefreshToken: boolean;
      missingScopes: string[];
    }) => boolean;
  },
): PanelCharacter & { needsLocationReconnect: boolean } {
  const eligibility = eligibilityOf(character);
  return {
    ...panelFields(character, !canSync.skillQueue(eligibility)),
    needsLocationReconnect: !canSync.location(eligibility),
  };
}
