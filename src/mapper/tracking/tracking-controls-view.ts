/** A tracking portrait's accessible name, shaped as the portrait pickers' itemLabel. */
export function trackingToggleLabel(
  character: { readonly name: string; readonly needsLocationReconnect?: boolean },
  tracked: boolean,
): string {
  if (character.needsLocationReconnect === true) {
    return tracked
      ? `Stop tracking ${character.name} (cannot sync location)`
      : `Track ${character.name} (reconnect required)`;
  }
  return tracked ? `Stop tracking ${character.name}` : `Track ${character.name}`;
}

export const SCANNER_ASK_VALUE = 'ask';

/** The select value for the default scanner; unlinked ids read as Ask. */
export function scannerSelectValue(
  scannerCharacterId: number | null,
  characters: readonly { readonly characterId: number }[],
): string {
  return scannerCharacterId !== null
    && characters.some((character) => character.characterId === scannerCharacterId)
    ? String(scannerCharacterId)
    : SCANNER_ASK_VALUE;
}

/** The roster entries this map lets the caller track; null ids mean the map still tracks per account. */
export function trackableCharacters<T extends { readonly characterId: number }>(
  characters: readonly T[],
  trackableCharacterIds: readonly number[] | null,
): T[] {
  if (trackableCharacterIds === null) return [...characters];
  const trackable = new Set(trackableCharacterIds);
  return characters.filter((character) => trackable.has(character.characterId));
}
