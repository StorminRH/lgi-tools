/** Better Auth provider id for EVE SSO. */
export const EVE_PROVIDER_ID = 'eve';

/** Canonical EVE OAuth authorization endpoint. */
export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
/** Canonical EVE OAuth token exchange and refresh endpoint. */
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
/** CCP's published OAuth2 token-revocation endpoint (RFC 7009). */
export const EVE_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
/** Canonical EVE JWKS endpoint used to verify access-token signatures. */
export const EVE_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
/** Required issuer claim for verified EVE access tokens. */
export const EVE_ISSUER = 'https://login.eveonline.com';
/** Required audience claim for verified EVE access tokens. */
export const EVE_AUDIENCE = 'EVE Online';

/**
 * EVE's account-level dashboard where a pilot reviews and revokes third-party app access.
 */
export const EVE_AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

/**
 * Exact read-only EVE scope set consumed by shipped features. Additions remain a deliberate,
 * batched decision verified against EVE's live scope vocabulary.
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
  'esi-corporations.read_structures.v1',
] as const;
