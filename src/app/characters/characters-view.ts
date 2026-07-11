import type { LinkedCharacter } from '@/features/auth/queries';
import { deriveCharacterHealth, type GrantedScope, listGrantedScopes } from '@/features/auth/scope-health';

// Pure decision logic for the /characters surface, kept out of the JSX shells so
// it can be tested directly. No DB, no network — everything derives from the
// already-loaded roster and grant strings.

export type CharacterRowView = {
  // Whether the character can't currently back its ESI calls (missing scopes or a
  // dead refresh token) — drives the "Reconnect" affordance.
  needsReconnect: boolean;
  // The degraded-state chip copy, or null when the grant is healthy.
  healthLabel: string | null;
  // What the character has actually granted, for the read-only disclosure.
  scopes: GrantedScope[];
};

// The per-row reads: health rollup, the health chip copy, and the granted-scope
// list — all off the stored grant string (no tokens, no new query).
export function deriveCharacterRowView(character: {
  scope: string | null;
  hasRefreshToken: boolean;
}): CharacterRowView {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const healthLabel = !health.needsReconnect
    ? null
    : character.hasRefreshToken
      ? 'Missing scopes'
      : 'Disconnected';
  return {
    needsReconnect: health.needsReconnect,
    healthLabel,
    scopes: listGrantedScopes(character.scope),
  };
}

// The absorb-on-proof success note: resolve the ?absorbed=<id> param against the
// just-loaded roster, which doubles as the whitelist — a non-string, stale, or
// forged id doesn't resolve, so nothing renders (fail-closed).
export function deriveAbsorbedCharacter(
  rawAbsorbed: string | string[] | undefined,
  characters: LinkedCharacter[],
): LinkedCharacter | undefined {
  const absorbedId = typeof rawAbsorbed === 'string' ? Number(rawAbsorbed) : null;
  return absorbedId !== null
    ? characters.find((c) => c.characterId === absorbedId)
    : undefined;
}
