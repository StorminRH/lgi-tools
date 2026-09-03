import type { CharacterRole } from '@/config/character-roles';

export type { CharacterRole };

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

export interface Session {
  characterId: number;
  name: string;
  portraitUrl: string;
  role: CharacterRole;
}

export interface EveTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
}

export interface EveJwtClaims {
  sub: string;
  name: string;
  scp?: string | string[];
  owner?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
}
