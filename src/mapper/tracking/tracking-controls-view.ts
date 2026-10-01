export function trackingToggleLabel(input: {
  readonly name: string;
  readonly tracked: boolean;
  readonly needsLocationReconnect: boolean;
}): string {
  if (input.needsLocationReconnect) {
    return input.tracked
      ? `Stop tracking ${input.name} (cannot sync location)`
      : `Track ${input.name} (reconnect required)`;
  }
  return input.tracked ? `Stop tracking ${input.name}` : `Track ${input.name}`;
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
