import { EVE_SCOPES, type EveScope } from '@/config/eve-scopes';

export interface CharacterHealth {
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
  required: readonly EveScope[],
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

const SCOPE_GLOSS = {
  publicData: 'Read your public character info',
  'esi-skills.read_skills.v1': 'Read your trained skills',
  'esi-skills.read_skillqueue.v1': 'Read your skill queue',
  'esi-industry.read_character_jobs.v1': 'Read your industry jobs',
  'esi-characters.read_corporation_roles.v1': 'Read your corporation roles',
  'esi-industry.read_corporation_jobs.v1': "Read your corporation's industry jobs",
  'esi-characters.read_blueprints.v1': 'Read your blueprints',
  'esi-corporations.read_blueprints.v1': "Read your corporation's blueprints",
  'esi-assets.read_assets.v1': 'Read your assets',
  'esi-assets.read_corporation_assets.v1': "Read your corporation's assets",
  'esi-location.read_online.v1': 'Read your online status',
  'esi-location.read_location.v1': 'Read your current location',
  'esi-location.read_ship_type.v1': 'Read your current ship type',
  'esi-corporations.read_structures.v1': "Read your corporation's structures",
  'esi-search.search_structures.v1': 'Search structures you can dock at by name',
  'esi-wallet.read_character_wallet.v1': 'Read your wallet balance and journal',
  'esi-clones.read_clones.v1': 'Read your jump clones',
  'esi-clones.read_implants.v1': 'Read your active implants',
  'esi-universe.read_structures.v1': 'Read the names of structures you can dock at',
  'esi-markets.read_character_orders.v1': 'Read your open market orders',
  'esi-corporations.read_divisions.v1': "Read your corporation's hangar division names",
  'esi-corporations.track_members.v1': "Read your corporation members' home stations",
} as const satisfies Record<EveScope, string>;

/** Scopes earlier sign-ins requested that EVE_SCOPES no longer does. */
const LEGACY_SCOPE_GLOSS: ReadonlyMap<string, string> = new Map([
  ['esi-planets.manage_planets.v1', 'Manage your planetary colonies'],
  ['esi-characters.read_standings.v1', 'Read your standings'],
]);

function describeLegacyScope(id: string): GrantedScope {
  const gloss = LEGACY_SCOPE_GLOSS.get(id);
  return gloss ? { id, gloss, status: 'legacy' } : { id, status: 'legacy' };
}

export function listGrantedScopes(scope: string | null | undefined): GrantedScope[] {
  const granted = tokenizeScopes(scope);
  const grantedSet = new Set(granted);
  const activeSet = new Set<string>(EVE_SCOPES);
  const active = EVE_SCOPES.filter((id) => grantedSet.has(id)).map(
    (id): GrantedScope => ({ id, gloss: SCOPE_GLOSS[id], status: 'active' }),
  );
  const legacy = granted.filter((id) => !activeSet.has(id)).map(describeLegacyScope);
  return [...active, ...legacy];
}
