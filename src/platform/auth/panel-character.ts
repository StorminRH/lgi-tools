import type { EveScope } from '@/config/eve-scopes';
import type { ScopeEligibility } from '@/lib/scope-eligibility';
import type { AccountCharactersResponse } from './api-contract';
import { deriveScopeHealth, scopeHolderOf } from './scope-health';

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
  canSync: ScopeEligibility,
): PanelCharacter {
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    needsReconnect: !canSync(scopeHolderOf(character)),
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
    skillQueue: readonly EveScope[];
    location: readonly EveScope[];
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
