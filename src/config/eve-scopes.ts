export const EVE_CHARACTER_SEARCH_SCOPE = 'esi-search.search_structures.v1';

/**
 * Every scope sign-in requests. A sync that needs a scope outside this list
 * would read as granted and then fail at ESI (the PR #83 lesson), so every
 * scope list in the app is typed against EveScope.
 */
export const EVE_SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-characters.read_blueprints.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-assets.read_assets.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-location.read_online.v1',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-corporations.read_structures.v1',
  EVE_CHARACTER_SEARCH_SCOPE,
  'esi-wallet.read_character_wallet.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-universe.read_structures.v1',
  'esi-markets.read_character_orders.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.track_members.v1',
] as const;

export type EveScope = (typeof EVE_SCOPES)[number];
