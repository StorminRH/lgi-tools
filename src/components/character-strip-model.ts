// Pure state math for the per-surface character strip (ACCOUNT.7) — the Humble
// Component split: the strip and the panels stay JSX shells over these tested
// helpers. Shared zone because both tracker features (skill queue, industry
// jobs) consume it and features never import each other.
//
// The dimmed array arrives from usePreference, which re-parses per render — the
// array's IDENTITY is unstable by construction (zod safeParse returns a fresh
// clone). Derive from it during render; never dep an effect/memo/callback on it.

/**
 * One character's participation state on a strip surface. Scope-missing wins
 * over a stored dim (fail-closed): a locked character is never toggleable, and
 * its stored dim state only re-applies once it reconnects.
 */
export type StripCharacterState = 'lit' | 'dimmed' | 'locked';

interface StripCharacter {
  characterId: number;
  needsReconnect: boolean;
}

export function stripState(
  character: StripCharacter,
  dimmedIds: readonly number[],
): StripCharacterState {
  if (character.needsReconnect) return 'locked';
  return dimmedIds.includes(character.characterId) ? 'dimmed' : 'lit';
}

/**
 * The render filter (VIEW-ONLY): drops only healthy characters the user dimmed.
 * Locked characters keep their card — the panel's in-place scope gate stays the
 * prominent reconnect affordance; the strip's locked portrait is additive.
 * STORE-OFF-NOT-ON: an id absent from `dimmedIds` (a new alt, an unknown or
 * stale id) renders — lit is the default, never stored.
 */
export function visibleCharacters<T extends StripCharacter>(
  characters: readonly T[],
  dimmedIds: readonly number[],
): T[] {
  return characters.filter((character) => stripState(character, dimmedIds) !== 'dimmed');
}

/**
 * The dimmed-set toggle. Returns null for a locked character (never toggles),
 * a NEW array otherwise. Stale ids of since-unlinked characters are left in
 * place rather than pruned — they are inert (see visibleCharacters), and a
 * relinked character restores its previous participation state.
 */
export function toggleDimmed(
  dimmedIds: readonly number[],
  character: StripCharacter,
): number[] | null {
  if (character.needsReconnect) return null;
  return dimmedIds.includes(character.characterId)
    ? dimmedIds.filter((id) => id !== character.characterId)
    : [...dimmedIds, character.characterId];
}

/**
 * The ids the on-view sync fetches — the panels' pre-strip inline derivation,
 * extracted verbatim. It takes NO dimmed input on purpose: dimming never touches
 * the fetch (the session's view-only pin); a real fetch-stop is a declared
 * carry-forward, not this seam.
 */
export function syncEligibleIds(characters: readonly StripCharacter[]): number[] {
  return characters
    .filter((character) => !character.needsReconnect)
    .map((character) => character.characterId);
}
