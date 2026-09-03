import { EVE_SCOPES } from './eve-sso';

export interface CharacterHealth {
  // True when the character can't currently back the required ESI calls: either

  needsReconnect: boolean;

  missingScopes: string[];
}

function tokenizeScopes(scope: string | null | undefined): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of (scope ?? '').split(/[,\s]+/)) {
    if (raw.length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
  }
  return tokens;
}

function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set(tokenizeScopes(scope));
}

export function deriveScopeHealth(
  {
    scope,
    hasRefreshToken,
  }: {
    scope: string | null | undefined;
    hasRefreshToken: boolean;
  },
  required: readonly string[],
): CharacterHealth {
  const granted = parseScopes(scope);
  const missingScopes = required.filter((s) => !granted.has(s));
  return {
    needsReconnect: !hasRefreshToken || missingScopes.length > 0,
    missingScopes,
  };
}

export function deriveCharacterHealth(input: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): CharacterHealth {
  return deriveScopeHealth(input, EVE_SCOPES);
}

export type GrantedScope = { id: string; gloss?: string; status: 'active' | 'legacy' };

const SCOPE_GLOSS: Record<string, string> = {

  publicData: 'Read your public character info',
  'esi-skills.read_skills.v1': 'Read your trained skills',
  'esi-skills.read_skillqueue.v1': 'Read your skill queue',
  'esi-industry.read_character_jobs.v1': 'Read your industry jobs',
  'esi-characters.read_corporation_roles.v1': 'Read your corporation roles',
  'esi-industry.read_corporation_jobs.v1': "Read your corporation's industry jobs",
  'esi-location.read_online.v1': 'Read your online status',
  'esi-location.read_location.v1': 'Read your current location',
  'esi-location.read_ship_type.v1': 'Read your current ship type',

  'esi-planets.manage_planets.v1': 'Manage your planetary colonies',
  'esi-characters.read_standings.v1': 'Read your standings',
  'esi-clones.read_implants.v1': 'Read your active implants',
  'esi-clones.read_clones.v1': 'Read your jump clones',
};

function describeScope(id: string, status: 'active' | 'legacy'): GrantedScope {
  const gloss = SCOPE_GLOSS[id];
  return gloss ? { id, gloss, status } : { id, status };
}

export function listGrantedScopes(scope: string | null | undefined): GrantedScope[] {
  const granted = tokenizeScopes(scope);
  const grantedSet = new Set(granted);
  const activeSet = new Set<string>(EVE_SCOPES);
  const active = EVE_SCOPES.filter((id) => grantedSet.has(id)).map((id) =>
    describeScope(id, 'active'),
  );
  const legacy = granted
    .filter((id) => !activeSet.has(id))
    .map((id) => describeScope(id, 'legacy'));
  return [...active, ...legacy];
}
