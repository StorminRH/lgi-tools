import { deriveCharacterHealth } from './scope-health';

/**
 * Client-safe per-character projection shared by the live tracker panels (the
 * /skills and /jobs surfaces) and the account characters API. The raw granted-
 * scope string never leaves the server — only this shape does.
 */
export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

/**
 * `needsReconnect` is the TRACKER's own eligibility rule (passed in as
 * `canSync`), not the full-superset sitewide health: each tracker needs only its
 * own scopes, so a character can be syncable for one tracker and not another.
 * /skills and the account API pass canSyncSkillQueue; /jobs passes
 * canSyncIndustryJobs.
 */
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
