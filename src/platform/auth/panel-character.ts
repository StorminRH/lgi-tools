import { deriveCharacterHealth } from './scope-health';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

type LinkedProjection = {
  characterId: number;
  name: string;
  portraitUrl: string;
  scope: string | null | undefined;
  hasRefreshToken: boolean;
};

type SyncGate = (eligibility: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}) => boolean;

function eligibilityOf(character: LinkedProjection): {
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
  character: LinkedProjection,
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
  character: LinkedProjection,
  canSync: SyncGate,
): PanelCharacter {
  return panelFields(character, !canSync(eligibilityOf(character)));
}

export function toAccountCharacter(
  character: LinkedProjection,
  canSync: {
    skillQueue: SyncGate;
    location: SyncGate;
  },
): PanelCharacter & { needsLocationReconnect: boolean } {
  const eligibility = eligibilityOf(character);
  return {
    ...panelFields(character, !canSync.skillQueue(eligibility)),
    needsLocationReconnect: !canSync.location(eligibility),
  };
}
