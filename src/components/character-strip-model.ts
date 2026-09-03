export type StripCharacterState = 'lit' | 'dimmed' | 'locked';

export interface StripCharacter {
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

export function visibleCharacters<T extends StripCharacter>(
  characters: readonly T[],
  dimmedIds: readonly number[],
): T[] {
  return characters.filter((character) => stripState(character, dimmedIds) !== 'dimmed');
}

export function toggleDimmed(
  dimmedIds: readonly number[],
  character: StripCharacter,
): number[] | null {
  if (character.needsReconnect) return null;
  return dimmedIds.includes(character.characterId)
    ? dimmedIds.filter((id) => id !== character.characterId)
    : [...dimmedIds, character.characterId];
}

export function syncEligibleIds(characters: readonly StripCharacter[]): number[] {
  return characters
    .filter((character) => !character.needsReconnect)
    .map((character) => character.characterId);
}
