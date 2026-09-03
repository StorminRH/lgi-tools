export { EVE_PROVIDER_ID } from '@/lib/eve-provider';

export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
/** CCP's published OAuth2 token-revocation endpoint (RFC 7009). */
export const EVE_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
export const EVE_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const EVE_ISSUER = 'https://login.eveonline.com';
export const EVE_AUDIENCE = 'EVE Online';
export const EVE_CHARACTER_SEARCH_SCOPE = 'esi-search.search_structures.v1';

export const EVE_AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

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
] as const;
