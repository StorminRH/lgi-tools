import type { CharacterRole } from './schema';

export type { CharacterRole };

// Row shape as returned by queries. Mirrors `characters` table.
export interface Character {
  characterId: number;
  name: string;
  portraitUrl: string;
  role: CharacterRole;
  preferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
}

// What `getSession()` returns for callers. Slimmer than `Character` —
// only the fields a route handler or server component cares about.
export interface Session {
  characterId: number;
  name: string;
  portraitUrl: string;
  role: CharacterRole;
}

// EVE SSO v2 token endpoint response. We only consume `access_token` in 2.8.1;
// `refresh_token` is captured in the type for clarity but discarded.
export interface EveTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

// Claims we read out of the verified EVE access-token JWT.
// `sub` is shaped "CHARACTER:EVE:<id>"; everything else is best-effort metadata.
export interface EveJwtClaims {
  sub: string;
  name: string;
  scp?: string | string[];
  owner?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

// Encrypted-cookie payload. Kept minimal — `getSession()` re-reads the DB
// row each call so role/preferences changes take effect without re-login.
export interface SessionPayload {
  characterId: number;
}
